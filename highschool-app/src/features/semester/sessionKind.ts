// 회차 유형 선택지 ↔ 저장값 변환 — 순수 함수.
//
// 저장 스키마는 그대로 둔다(`type`: 정규|휴강|행사, `label`: 자유 문자열).
// 화면에서는 개강·종강처럼 자주 쓰는 라벨을 고르거나 직접 입력할 수 있게 하고,
// **출석 집계에서 빠지는 것은 휴강뿐**이라는 규칙을 바꾸지 않는다(completion.regularSessions).

import type { Session, SessionType } from "./types";

export const SESSION_KINDS = ["정규", "개강", "종강", "휴강", "직접"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  정규: "정규",
  개강: "개강",
  종강: "종강",
  휴강: "휴강 (출석 집계 제외)",
  직접: "직접 입력",
};

export type SessionValue = { type: SessionType; label: string | null };

/** 선택지 → 저장값. 직접 입력은 텍스트가 비면 정규로 떨어진다. */
export function sessionValueFor(kind: SessionKind, customLabel = ""): SessionValue {
  const custom = customLabel.trim();
  switch (kind) {
    case "휴강":
      return { type: "휴강", label: null };
    case "개강":
      return { type: "정규", label: "개강" };
    case "종강":
      return { type: "정규", label: "종강" };
    case "직접":
      return { type: "정규", label: custom || null };
    default:
      return { type: "정규", label: null };
  }
}

/** 저장값 → 선택지 (레거시 `행사` 타입과 임의 라벨도 흡수한다) */
export function sessionKindOf(session: Pick<Session, "type" | "label">): {
  kind: SessionKind;
  customLabel: string;
} {
  if (session.type === "휴강") return { kind: "휴강", customLabel: "" };
  const label = session.label?.trim() ?? "";
  if (label === "개강") return { kind: "개강", customLabel: "" };
  if (label === "종강") return { kind: "종강", customLabel: "" };
  if (label) return { kind: "직접", customLabel: label };
  return { kind: session.type === "행사" ? "직접" : "정규", customLabel: "" };
}

/** 목록·선택 상자에 보이는 한 단어 */
export function sessionDisplayLabel(session: Pick<Session, "type" | "label">): string {
  if (session.type === "휴강") return "휴강";
  return session.label?.trim() || (session.type === "행사" ? "행사" : "정규");
}

/** 직접 입력을 골랐는데 텍스트가 비었는지 — 저장 전에 막는다 */
export function needsCustomLabel(kind: SessionKind, customLabel: string): boolean {
  return kind === "직접" && customLabel.trim() === "";
}
