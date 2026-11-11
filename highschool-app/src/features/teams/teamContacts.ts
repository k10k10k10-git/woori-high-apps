import { auth } from "@/lib/firebase";
import type { User } from "@/lib/supabaseAuth";
import type { SundayTeamKey } from "@/features/portal/featureCatalog";
import type { RosterContact } from "@/features/semester/rosterContact";

/** 공식 연간 원장 전체를 브라우저에 전달하지 않고 담당 팀의 연락처만 조회한다. */
export async function fetchTeamRosterContacts(
  user: Pick<User, "uid" | "getIdToken">,
  semesterId: string,
  teamKey: SundayTeamKey,
  signal?: AbortSignal,
): Promise<Record<string, RosterContact>> {
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다. 새로고침해 주세요.");
  const query = new URLSearchParams({ semesterId, teamKey });
  const response = await fetch(`/api/team-contacts?${query}`, {
    cache: "no-store", signal, headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다. 새로고침해 주세요.");
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "연락처를 불러오지 못했습니다.");
  return body?.contacts ?? {};
}
