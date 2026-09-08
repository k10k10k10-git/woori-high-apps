import { describe, expect, it } from "vitest";
import { buildPraiseCutover, guardedCutoverValue } from "./praise-cutover.mjs";
function fixture() {
  const person = {
    id: "p",
    kind: "STUDENT",
    name: "합성학생",
    department: "FIRST",
    grade: 2,
    revision: 1,
  };
  const app = {
    name: "합성학생",
    bu: "1부",
    grade: 2,
    class: 2,
    studentId: "s",
    personId: "person_student_s",
    trainingClassId: "t",
    teamId: "team",
    status: "배치",
  };
  return {
    workspace: {
      meta: {
        id: "w",
        semesterId: "2026-2",
        teamId: "team",
        mode: "shadow",
        status: "active",
        revision: 1,
        startDate: "2026-08-01",
        endDate: "2026-12-31",
        activeGroupVersionId: "g",
        importBlockers: [
          "historical_group_unresolved",
          "source_snapshot_unverified",
          "source_storage_incomplete",
        ],
      },
      people: { p: person },
      meetings: {
        old: { id: "old", date: "2026-08-29", revision: 1, cancelled: false },
        next: { id: "next", date: "2026-09-12", revision: 1, cancelled: false },
      },
      groupVersions: { g: { kind: "CONFIRMED" } },
      attendance: { old: { p: { status: "PRESENT" } } },
    },
    semester: {
      teams: { team: { name: "찬양팀" } },
      applications: { "1_s": app },
      trainingClasses: { t: {} },
      sessions: {
        old: { date: "2026-08-29", type: "정규" },
        next: { date: "2026-09-12", type: "정규" },
      },
      attendance: { team: { old: { "1_s": { s: "결석" } } } },
    },
    classes: {
      "1-2-2": {
        students: { s: { name: "합성학생", personId: "person_student_s" } },
      },
    },
    staff: {},
    additions: [],
    dateAliases: {},
    attendanceChoices: { "p/old": "PRESENT" },
    actorUid: "operator",
    at: 1,
    readOnlyBefore: "2026-09-12",
    sourceVerified: true,
  };
}
describe("찬양팀 운영 전환 계획", () => {
  it("공식 인물키·훈련과 회차를 연결하고 승인된 출석만 정정한다", () => {
    const input = fixture();
    const p = buildPraiseCutover(input);
    expect(p.report).toMatchObject({
      people: 1,
      meetings: 2,
      attendanceResolved: 1,
    });
    expect(p.after.people.p.rosterLink.personId).toBe("person_student_s");
    expect(p.semesterAfter.attendance.team.old["1_s"].s).toBe("출석");
    expect(input.semester.attendance.team.old["1_s"].s).toBe("결석");
    expect(p.after.meta.historyReview).toEqual([
      "historical_group_unresolved",
      "source_storage_incomplete",
    ]);
    expect(p.after.meta.mode).toBe("live");
    expect(p.after.meetings.old.groupVersionId).toBe("import-unresolved");
    expect(p.after.meetings.next.groupVersionId).toBeUndefined();
  });
  it("동명이인·공식키 불일치·출석충돌 미승인을 중단한다", () => {
    const a = fixture();
    a.classes["1-2-2"].students.s.personId = "person_student_other";
    expect(() => buildPraiseCutover(a)).toThrow(/official_identity/);
    const b = fixture();
    b.attendanceChoices = {} as typeof b.attendanceChoices;
    expect(() => buildPraiseCutover(b)).toThrow(/conflict_requires/);
    const c = fixture();
    Object.assign(c.semester.applications, {
      duplicate: c.semester.applications["1_s"],
    });
    expect(() => buildPraiseCutover(c)).toThrow(/ambiguous_roster/);
  });
  it("적용 후 재시도는 멱등이고 동시 변경은 덮어쓰지 않는다", () => {
    expect(guardedCutoverValue({ v: 2 }, { v: 1 }, { v: 2 })).toEqual({ v: 2 });
    expect(() => guardedCutoverValue({ v: 3 }, { v: 1 }, { v: 2 })).toThrow(
      /concurrent/,
    );
    expect(guardedCutoverValue({ v: 1 }, { v: 1 }, { v: 2 })).toEqual({ v: 2 });
  });
});
