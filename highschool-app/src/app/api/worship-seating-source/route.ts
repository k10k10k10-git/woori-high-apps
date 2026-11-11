import { canAccessArea, canAccessSundayTeam } from "@/features/portal/accessPolicy";
import { activeTeamKeys } from "@/features/teams/teamModel";
import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { getPraiseAdmin, praiseUnavailable } from "@/features/praise/server/supabaseAdmin";
import { praiseHttp } from "@/features/praise/server/http";
import { date, requireValue } from "@/features/praise/server/validation";
import { sundayOf, worshipSeatingSource, type ClassAttendance, type WorshipService } from "@/features/sundayWorship/worshipSeating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    requireValue(
      canAccessArea("sunday", actor.roles)
        && canAccessSundayTeam("worship", actor.roles, activeTeamKeys(actor.teamMemberships)),
      "예배팀 자료에 접근할 수 없습니다.", "forbidden", 403,
    );
    const query = new URL(request.url).searchParams;
    const week = date(query.get("week"), "주일");
    requireValue(sundayOf(new Date(`${week}T12:00:00Z`)) === week, "주일 날짜를 확인해 주세요.");
    const service = query.get("service");
    requireValue(service === "1" || service === "2", "예배 부를 확인해 주세요.");
    const year = week.slice(0, 4);
    const database = getPraiseAdmin().database;
    let rawClasses: unknown;
    let rawAttendance: unknown;
    try {
      [rawClasses, rawAttendance] = await Promise.all([
        database.get(`classes/${year}`),
        database.get(`attendance/${year}`),
      ]);
    } catch {
      throw praiseUnavailable("worship_seating_unavailable");
    }
    const classes = rawClasses && typeof rawClasses === "object" && !Array.isArray(rawClasses)
      ? rawClasses as Record<string, unknown> : {};
    const attendance = rawAttendance && typeof rawAttendance === "object" && !Array.isArray(rawAttendance)
      ? rawAttendance as Record<string, ClassAttendance> : {};
    return worshipSeatingSource(classes, attendance, week, service as WorshipService);
  });
}
