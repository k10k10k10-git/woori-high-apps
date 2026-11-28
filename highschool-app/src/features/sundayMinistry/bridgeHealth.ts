// 우리틴즈 → 통합사이트 출석 사본(교적 다리)의 상태(우리틴즈 api.hs_bridge_health, 0148). 통합관리자·행정팀·교역자만 읽을 수 있다.
// Supabase RPC 접근은 이 모듈에서만 한다. 못 읽으면(권한 없음·아직 없는 함수·연결 오류) 배너를 띄우지 않는다 — 잘못된 경보보다 조용한 쪽.
// 응답에는 상태·사유 코드만 있다(이름·건수·경로 없음). 화면 글은 쉬운 말로 바꾼다.
import { getSupabase } from "@/lib/supabase";

export interface BridgeHealthRow {
  year: number;
  status: string;
  alert: boolean;
  stuckMinutes: number | null;
  reasons: string[];
  notices: string[];
}

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

/** 응답 → 줄. 모양이 이상한 줄은 버린다. */
export function readBridgeHealth(data: unknown): BridgeHealthRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((value): BridgeHealthRow[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.alert !== "boolean" || typeof row.status !== "string") return [];
    const minutes = typeof row.stuck_minutes === "number" && Number.isFinite(row.stuck_minutes) ? Math.max(0, Math.floor(row.stuck_minutes)) : null;
    return [{ year: Number(row.year), status: row.status, alert: row.alert, stuckMinutes: minutes, reasons: strings(row.reasons), notices: strings(row.notices) }];
  });
}

/** 막힘 사유 코드 → 쉬운 말(우리틴즈 오늘의 사역 배너와 같은 말). 모르는 코드는 '자동 반영이 멈춤'. */
export const BRIDGE_REASON_TEXT: Readonly<Record<string, string>> = {
  unmanaged_fields_lost: "반을 옮긴 학생 정보",
  identity_change: "학생 연결 정보가 바뀜",
  large_delete: "많은 학생이 한꺼번에 빠짐",
  possible_duplicates: "같은 학생이 두 번 보일 수 있음",
  person_id_elsewhere: "같은 학생이 두 번 보일 수 있음",
  sid_conflicts: "학생 번호가 겹침",
  error: "자동 반영이 멈춤",
  stale: "자동 반영이 멈춤",
};

/** 안내 코드 → 쉬운 말. 모르는 코드는 보이지 않는다. */
export const BRIDGE_NOTICE_TEXT: Readonly<Record<string, string>> = {
  legacy_writes: "옛 학생 출석부에 입력한 출석이 있어요. 그 값은 곧 우리틴즈 출석으로 바뀌니, 출석은 우리틴즈 출석부에서 입력해 주세요.",
  unmanaged: "이 출석부에만 있고 우리틴즈 명단에는 없는 학생이 있어요. 개발 담당자에게 알려 주세요.",
};

function stuckText(minutes: number | null) {
  if (minutes === null) return "";
  return minutes < 60 ? `${minutes}분째 ` : `${Math.floor(minutes / 60)}시간째 `;
}

export interface BridgeBanner { alerts: string[]; notices: string[] }
export const NO_BRIDGE_BANNER: BridgeBanner = { alerts: [], notices: [] };

/** 막힘 배너 줄(DB 가 alert 로 판정한 해마다, 두 해면 해를 붙인다)과 안내 줄(같은 안내는 한 번). */
export function bridgeBanner(rows: readonly BridgeHealthRow[]): BridgeBanner {
  const alertRows = rows.filter((row) => row.alert);
  const alerts = alertRows.map((row) => {
    const why = [...new Set(row.reasons.map((code) => BRIDGE_REASON_TEXT[code] ?? "자동 반영이 멈춤"))].join(", ");
    const year = alertRows.length > 1 ? `${row.year}년 ` : "";
    return `${year}우리틴즈 출석이 이 출석부로 ${stuckText(row.stuckMinutes)}넘어오지 않고 있어요${why ? `(${why})` : ""}. 개발 담당자에게 알려 주세요.`;
  });
  const codes = new Set(rows.flatMap((row) => row.notices));
  const notices = Object.keys(BRIDGE_NOTICE_TEXT).filter((code) => codes.has(code)).map((code) => BRIDGE_NOTICE_TEXT[code]);
  return { alerts, notices };
}

/** 지금 상태. 권한이 없거나 못 읽으면 빈 배너. */
export async function fetchBridgeBanner(): Promise<BridgeBanner> {
  try {
    const { data, error } = await getSupabase().schema("api").rpc("hs_bridge_health");
    return error ? NO_BRIDGE_BANNER : bridgeBanner(readBridgeHealth(data));
  } catch {
    return NO_BRIDGE_BANNER;
  }
}
