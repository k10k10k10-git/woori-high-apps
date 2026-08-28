import { describe, expect, it } from "vitest";
import type { Participant, Student } from "./types";
import { buildRematchPlan, buildSheetSyncPlan } from "./participantSyncPreview";

const baseParticipant: Participant = {
  name: "김하나",
  gender: "여",
  grade: 2,
  class: 3,
  bu: "1부",
  registeredAt: "2026. 8. 1",
};

const student: Student = {
  id: "student-1",
  name: "김하나",
  num: 1,
  grade: 2,
  class: 3,
  buNum: 1,
  birth: "2010-01-01",
  phone: "010-1111-2222",
  pPhone: "010-3333-4444",
  addr: "",
  photo: "",
  school: "한솔고",
};

describe("buildSheetSyncPlan", () => {
  it("쓰기 없이 추가·제외·특이사항 보존 수를 계산한다", () => {
    const existing = {
      old: { ...baseParticipant, studentId: "student-1", extra: "알레르기" },
      removed: { ...baseParticipant, name: "이둘", class: 4, studentId: "student-2" },
    };
    const plan = buildSheetSyncPlan([baseParticipant], { [student.id]: student }, existing);

    expect(plan.participants.p_0).toMatchObject({ studentId: "student-1", extra: "알레르기" });
    expect(plan.summary).toMatchObject({ currentCount: 2, sourceCount: 1, nextCount: 1, removedCount: 1, preservedExtraCount: 1 });
  });

  it("중복 신청을 계획에 표시하고 한 명만 반영한다", () => {
    const plan = buildSheetSyncPlan([baseParticipant, { ...baseParticipant, registeredAt: "2026. 8. 2" }], { [student.id]: student }, {});
    expect(plan.summary.duplicateGroupCount).toBe(1);
    expect(plan.summary.nextCount).toBe(1);
    expect(plan.duplicates[0].entries).toHaveLength(2);
  });
});

describe("buildRematchPlan", () => {
  it("변경되는 연결 필드만 계획하고 원본 참가자를 수정하지 않는다", () => {
    const participants = { p_0: { ...baseParticipant, phone: null, pPhone: null } };
    const plan = buildRematchPlan(participants, { [student.id]: student });

    expect(plan.updates.p_0).toEqual({ studentId: "student-1", phone: student.phone, pPhone: student.pPhone });
    expect(plan.summary).toMatchObject({ changedCount: 1, matchedCount: 1, unmatchedCount: 0 });
    expect(participants.p_0.studentId).toBeUndefined();
  });
});
