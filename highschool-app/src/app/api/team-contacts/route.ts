import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "@/features/praise/server/firebaseAdmin";
import { praiseHttp } from "@/features/praise/server/http";
import { buildRosterContactMap } from "@/features/semester/rosterContact";
import type { Application, ClassInfo, StaffPerson, Team } from "@/features/semester/types";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import { canReadTeamContacts, semesterTeamForKey } from "@/features/teams/teamModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    const url = new URL(request.url);
    const semesterId = url.searchParams.get("semesterId") ?? "";
    const teamKey = url.searchParams.get("teamKey") ?? "";
    const teamMeta = sundayTeamOf(teamKey);
    if (!/^\d{4}-(?:1|2|sunday)$/.test(semesterId) || !teamMeta
      || !canReadTeamContacts(teamMeta.key, actor.roles, actor.teamMemberships, semesterId)) {
      return { contacts: {} };
    }

    const database = getPraiseFirebaseAdmin().database;
    const year = semesterId.slice(0, 4);
    let values: unknown[];
    try {
      values = await Promise.all([
        `semesters/${semesterId}/teams`, `semesters/${semesterId}/applications`,
        `classes/${year}`, `teacherStaff/${year}`,
      ].map(async (path) => (await database.ref(path).get()).val()));
    } catch {
      throw praiseUnavailable("contacts_unavailable");
    }
    const [rawTeams, rawApplications, rawClasses, rawStaff] = values;
    const list = <T extends { id: string }>(value: unknown): T[] =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.entries(value).map(([id, fields]) => ({ ...(fields as object), id }) as T)
        : [];
    const team = semesterTeamForKey(list<Team>(rawTeams), teamMeta.key);
    if (!team) return { contacts: {} };
    const applications = list<Application>(rawApplications)
      .filter((application) => application.teamId === team.id && application.status !== "취소");
    const classes = rawClasses && typeof rawClasses === "object" && !Array.isArray(rawClasses)
      ? Object.entries(rawClasses).map(([classKey, data]) => ({
        classKey, students: (data as ClassInfo).students ?? {},
      })) : [];
    const staff = rawStaff && typeof rawStaff === "object" && !Array.isArray(rawStaff)
      ? Object.entries(rawStaff).map(([staffId, data]) => ({ staffId, ...(data as object) })) as StaffPerson[] : [];
    const allContacts = buildRosterContactMap(classes, staff, applications);
    return { contacts: Object.fromEntries(applications.map(({ id }) => [id, allContacts[id] ?? {}])) };
  });
}
