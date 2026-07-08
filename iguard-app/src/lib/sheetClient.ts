import { auth } from "@/lib/firebase";

/** 구글 시트 CSV를 서버 프록시(/api/sheet-import)를 통해 가져온다.
 *  브라우저 직접 fetch는 CORS·307 리다이렉트로 불가 — 프록시가 Firebase ID 토큰을 검증한다.
 *  query 예: `id=<sheetId>&gid=<gid>` (본문 탭) 또는 `id=<sheetId>&sheet=<탭이름>` (이름으로 조회). */
export async function fetchSheetCsv(query: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/sheet-import?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "불러오기 실패");
  return data.csv || "";
}
