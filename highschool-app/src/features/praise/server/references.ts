import "server-only";
import { paths } from "@/lib/paths";
import { paths as semesterPaths } from "@/features/semester/paths";
import {
  describeRoles,
  resolveMinistryRoles,
} from "@/features/portal/accessPolicy";
import { canAccessTeam, mergeTeamMemberships, teamKeyFromName } from "@/features/teams/teamModel";
import type { PraiseActor } from "../types";
import { assertPraiseId } from "../paths";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";
import { requireValue } from "./validation";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
async function read(path: string) {
  try {
    return (
      await getPraiseFirebaseAdmin().database.ref(path).get()
    ).val() as unknown;
  } catch {
    throw praiseUnavailable("reference_unavailable");
  }
}
async function shallow(path: string): Promise<string[]> {
  const { app } = getPraiseFirebaseAdmin();
  try {
    const token = await app.options.credential!.getAccessToken();
    const url = new URL(app.options.databaseURL!);
    url.pathname = `/${path}.json`;
    url.searchParams.set("shallow", "true");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    const value = await response.json();
    if (value === null) return [];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return Object.entries(record(value)).map(([key, exists]) => {
      if (exists !== true) throw new Error();
      return assertPraiseId(key);
    });
  } catch {
    throw praiseUnavailable("reference_unavailable");
  }
}

/** 목록 탐색용 ID만 읽는다. 학기 원장 전체 get()으로 대체하지 않는다. */
export function listSemesterIds(): Promise<string[]> {
  return shallow(semesterPaths.semesters());
}

/** 운영 책임자용 계정 선택에 승인된 이름·등록 이메일을 제공한다. 토큰·원래 역할 원장은 반환하지 않는다. */
export async function praiseAccounts() {
  const [admins, retreatAdmins, members, iguardRoles] = await Promise.all(
    [
      paths.mainAdmins(),
      paths.retreatAdmins(),
      "iguardMembers",
      "iguardRoles",
    ].map(read),
  ).then((values) => values.map(record));
  const uids = new Set([
    ...Object.keys(admins),
    ...Object.keys(retreatAdmins),
    ...Object.keys(members),
  ]);
  return [...uids]
    .flatMap((uid) => {
      const source = record(retreatAdmins[uid] ?? members[uid]);
      const roles = resolveMinistryRoles({
        isMainAdmin: admins[uid] === true,
        hasRetreatAdmin: retreatAdmins[uid] != null,
        retreatAdminRole: record(retreatAdmins[uid]).role,
        hasIguardMember: members[uid] != null,
        iguardRole: iguardRoles[uid],
        semesterRole: source.semesterRole,
        retreatRole: source.retreatRole,
      });
      const teamMemberships = mergeTeamMemberships(
        record(members[uid]).teamMemberships,
        record(retreatAdmins[uid]).teamMemberships,
      );
      if (!canAccessTeam("praise", roles, teamMemberships)) return [];
      const name =
        typeof source.name === "string" && source.name.trim()
          ? source.name.trim().slice(0, 80)
          : "이름 미등록 계정";
      const email = typeof source.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.email.trim()) ? source.email.trim().slice(0, 254) : undefined;
      return [{ uid, name, roleLabel: describeRoles(roles), ...(email ? { email } : {}) }];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 학기 키와 meta/teams만 읽고, 신청·출결·연락처 원장은 다운로드하지 않는다. */
export async function praiseReferences(actor: PraiseActor) {
  const ids = await listSemesterIds();
  const semesters = [];
  for (const id of ids.sort().reverse()) {
    if (!canAccessTeam("praise", actor.roles, actor.teamMemberships, id)) continue;
    const [metaValue, teamsValue] = await Promise.all([
      read(semesterPaths.semesterMeta(id)),
      read(semesterPaths.teams(id)),
    ]);
    if (!metaValue) continue;
    const meta = record(metaValue);
    const teams = Object.entries(record(teamsValue)).flatMap(([teamId, value]) => {
      const team = record(value);
      const name = typeof team.name === "string" ? team.name : teamId;
      if (team.teamKey !== "praise" && teamKeyFromName(name) !== "praise") return [];
      return [{ id: teamId, name }];
    });
    if (teams.length === 0) continue;
    semesters.push({
      id,
      title: typeof meta.title === "string" ? meta.title : id,
      ...(typeof meta.startDate === "string"
        ? { startDate: meta.startDate }
        : {}),
      ...(typeof meta.endDate === "string" ? { endDate: meta.endDate } : {}),
      teams,
    });
  }
  return semesters;
}

export async function validateSemesterLink(
  semesterId?: string,
  teamId?: string,
) {
  requireValue(
    Boolean(semesterId) === Boolean(teamId),
    "학기와 찬양팀을 함께 선택해 주세요.",
  );
  if (!semesterId || !teamId) return;
  const [meta, team] = await Promise.all([
    read(semesterPaths.semesterMeta(semesterId)),
    read(`${semesterPaths.teams(semesterId)}/${assertPraiseId(teamId)}`),
  ]);
  requireValue(
    Boolean(meta && team && (record(team).teamKey === "praise" || teamKeyFromName(String(record(team).name ?? "")) === "praise")),
    "연결할 학기 또는 찬양팀이 없습니다. 목록을 새로고침해 주세요.",
  );
}
