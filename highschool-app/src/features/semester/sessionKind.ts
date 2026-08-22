// 회차 유형 선택지 ↔ 저장값 변환 — 순수 함수.
//
// 저장 스키마는 그대로 둔다(`type`: 정규|휴강|행사, `label`: 자유 문자열).
// 화면에서는 개강·종강·휴강의 표준 문구를 고르거나 직접 입력할 수 있게 하고,
// **출석 집계에서 빠지는 것은 휴강뿐**이라는 규칙을 바꾸지 않는다(completion.regularSessions).

import type { Session, SessionType } from "./types";

export const SESSION_MINISTRY_LABEL = {
  개강: "훈련&사역팀 개강",
  종강: "훈련&사역팀 종강",
  휴강: "훈련&사역팀 휴강",
} as const;

export const SESSION_KINDS = ["개강", "종강", "휴강", "직접"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
export const DEFAULT_SESSION_KIND: SessionKind = "직접";

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  개강: SESSION_MINISTRY_LABEL.개강,
  종강: SESSION_MINISTRY_LABEL.종강,
  휴강: SESSION_MINISTRY_LABEL.휴강,
  직접: "직접 입력",
};

export type SessionValue = { type: SessionType; label: string | null };

/** 선택지 → 저장값. 직접 입력은 텍스트가 비면 라벨 없는 정규 회차로 떨어진다. */
export function sessionValueFor(kind: SessionKind, customLabel = ""): SessionValue {
  const custom = customLabel.trim();
  switch (kind) {
    case "휴강":
      return { type: "휴강", label: SESSION_MINISTRY_LABEL.휴강 };
    case "개강":
      return { type: "정규", label: SESSION_MINISTRY_LABEL.개강 };
    case "종강":
      return { type: "정규", label: SESSION_MINISTRY_LABEL.종강 };
    case "직접":
      return { type: "정규", label: custom || null };
  }
}

/** 저장값 → 선택지 (레거시 `행사` 타입과 임의 라벨도 흡수한다) */
export function sessionKindOf(session: Pick<Session, "type" | "label">): {
  kind: SessionKind;
  customLabel: string;
} {
  if (session.type === "휴강") return { kind: "휴강", customLabel: "" };
  const label = session.label?.trim() ?? "";
  if (label === "개강" || label === SESSION_MINISTRY_LABEL.개강) return { kind: "개강", customLabel: "" };
  if (label === "종강" || label === SESSION_MINISTRY_LABEL.종강) return { kind: "종강", customLabel: "" };
  if (label) return { kind: "직접", customLabel: label };
  return { kind: "직접", customLabel: "" };
}

/** 목록·달력·선택 상자에 보이는 표준 문구. 레거시 짧은 라벨도 즉시 정규화한다. */
export function sessionDisplayLabel(session: Pick<Session, "type" | "label">): string {
  if (session.type === "휴강") return SESSION_MINISTRY_LABEL.휴강;
  const label = session.label?.trim() ?? "";
  if (label === "개강" || label === SESSION_MINISTRY_LABEL.개강) return SESSION_MINISTRY_LABEL.개강;
  if (label === "종강" || label === SESSION_MINISTRY_LABEL.종강) return SESSION_MINISTRY_LABEL.종강;
  return label || (session.type === "행사" ? "행사" : "훈련&사역팀 모임");
}

/**
 * 화면에 표시할 주차명. 휴강은 주차 수에 포함하지 않고, 그 뒤 모임도 연속 번호를 유지한다.
 * 저장 순서나 세션 ID는 건드리지 않는 표시 전용 계산이다.
 */
export function sessionWeekLabel(sessions: Pick<Session, "type">[], index: number): string {
  if (sessions[index]?.type === "휴강") return "휴강";
  const week = sessions.slice(0, index + 1).filter((session) => session.type !== "휴강").length;
  return `${week}주차`;
}

/** 직접 입력을 골랐는데 텍스트가 비었는지 — 저장 전에 막는다 */
export function needsCustomLabel(kind: SessionKind, customLabel: string): boolean {
  return kind === "직접" && customLabel.trim() === "";
}
