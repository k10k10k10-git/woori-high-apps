import { describe, it, expect } from "vitest";
import { calcCompletion, calcScopedCompletions, EDITABLE_ATTENDANCE_STATUSES, normalizeAttendanceStatus } from "./completion";
import { AttendanceByScope, Session, SessionAttendance } from "./types";

const sessions: Session[] = [
  { id: "s1", date: "2026-03-14", type: "정규" },
  { id: "s2", date: "2026-03-21", type: "정규" },
  { id: "s3", date: "2026-04-18", type: "휴강" }, // 만점 제외
  { id: "s4", date: "2026-05-02", type: "정규" },
];

function att(map: Record<string, Record<string, "출석" | "지각" | "결석">>) {
  const out: Record<string, SessionAttendance> = {};
  for (const [sessId, entries] of Object.entries(map)) {
    out[sessId] = {};
    for (const [appKey, s] of Object.entries(entries)) out[sessId][appKey] = { s };
  }
  return out;
}

describe("calcCompletion — 출석·레거시 지각2/결석0, 휴강 제외", () => {
  it("전부 출석이면 만점·수료", () => {
    const r = calcCompletion("a", sessions, att({ s1: { a: "출석" }, s2: { a: "출석" }, s4: { a: "출석" } }), 0.7);
    expect(r.maxScore).toBe(6); // 정규 3회 × 2 (휴강 s3 제외)
    expect(r.score).toBe(6);
    expect(r.completed).toBe(true);
  });

  it("남아 있는 지각은 출석과 같은 2점, 미기록은 0점으로 집계", () => {
    // 출석2 + 레거시 지각2 + 미기록0 = 4/6 → 70% 기준 미수료
    const r = calcCompletion("a", sessions, att({ s1: { a: "출석" }, s2: { a: "지각" } }), 0.7);
    expect(r.score).toBe(4);
    expect(r.completed).toBe(false);
  });

  it("새 입력은 출석·결석만 허용하고 레거시 지각은 출석으로 정규화한다", () => {
    expect(EDITABLE_ATTENDANCE_STATUSES).toEqual(["출석", "결석"]);
    expect(normalizeAttendanceStatus("지각")).toBe("출석");
    expect(normalizeAttendanceStatus("결석")).toBe("결석");
  });

  it("휴강 회차의 기록은 점수에 포함되지 않는다", () => {
    const r = calcCompletion("a", sessions, att({ s3: { a: "출석" } }), 0.7);
    expect(r.score).toBe(0);
  });

  it("경계값: 정확히 minRate면 수료", () => {
    // 출석2+출석2+결석0 = 4/6 ≈ 0.667 <0.7 미수료 / minRate 0.667 이하로 낮추면 수료
    const a = att({ s1: { a: "출석" }, s2: { a: "출석" }, s4: { a: "결석" } });
    expect(calcCompletion("a", sessions, a, 0.7).completed).toBe(false);
    expect(calcCompletion("a", sessions, a, 4 / 6).completed).toBe(true);
  });

  it("정규 회차가 0개면 수료 아님 (0나눗셈 방어)", () => {
    const r = calcCompletion("a", [{ id: "x", date: "2026-01-01", type: "휴강" }], {}, 0.7);
    expect(r.rate).toBe(0);
    expect(r.completed).toBe(false);
  });
});

describe("calcScopedCompletions — 사역팀·훈련 출석 분리", () => {
  it("같은 신청자라도 각 출석 원장의 기록만으로 별도 판정한다", () => {
    const attendance: AttendanceByScope = {
      team: att({ s1: { a: "출석" }, s2: { a: "출석" }, s4: { a: "출석" } }),
      training: att({ s1: { a: "결석" } }),
    };

    const result = calcScopedCompletions("a", sessions, attendance, 0.7, {
      team: true,
      training: true,
    });

    expect(result.team).toMatchObject({ score: 6, completed: true });
    expect(result.training).toMatchObject({ score: 0, completed: false });
  });

  it("신청하지 않은 축은 출석값이 있어도 판정 대상이 아니다", () => {
    const attendance: AttendanceByScope = {
      team: {},
      training: att({ s1: { a: "출석" }, s2: { a: "출석" }, s4: { a: "출석" } }),
    };

    const result = calcScopedCompletions("a", sessions, attendance, 0.7, {
      team: true,
      training: false,
    });

    expect(result.team?.completed).toBe(false);
    expect(result.training).toBeNull();
  });
});
