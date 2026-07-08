import { describe, it, expect } from "vitest";
import { buildExtraPreservationMaps, dedupeSheetParticipants, identityKeyOf } from "./syncParticipants";
import { Participant, Student } from "./types";

function participant(over: Partial<Participant>): Participant {
  return {
    name: "홍길동", gender: "남", grade: 1, class: 1, bu: "1부",
    registeredAt: "2026. 7. 1 오전 10:00:00",
    ...over,
  };
}

function student(over: Partial<Student>): Student {
  return {
    id: "1_S11_01", name: "홍길동", num: 1, grade: 1, class: 1, buNum: 1,
    birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "",
    ...over,
  } as Student;
}

describe("identityKeyOf", () => {
  it("이름 trim + bu 폴백 빈문자열로 조립한다", () => {
    expect(identityKeyOf(participant({ name: " 김철수 ", bu: "1부", grade: 2, class: 3 })))
      .toBe("김철수|1부|2|3");
    expect(identityKeyOf({ name: "김철수", bu: undefined as unknown as string, grade: 2, class: 3 }))
      .toBe("김철수||2|3");
  });
});

describe("buildExtraPreservationMaps — 사양 A (특이사항 보존)", () => {
  it("A1: studentId가 유일하면 보존맵에서 조회된다", () => {
    const { extraByStudentId } = buildExtraPreservationMaps({
      p_0: participant({ studentId: "s1", extra: "메모" }),
    });
    expect(extraByStudentId.get("s1")).toBe("메모");
  });

  it("A2: 같은 studentId가 2명이면 그 키는 보존에서 제외된다 (오염 가드)", () => {
    const { extraByStudentId } = buildExtraPreservationMaps({
      p_0: participant({ name: "이가영", studentId: "s1", extra: "메모A" }),
      p_1: participant({ name: "이나영", studentId: "s1", extra: "메모B" }),
    });
    expect(extraByStudentId.get("s1")).toBeUndefined();
  });

  it("A3: studentId 없는 참가자는 identity 키로 보존되고, identity 중복이면 제외된다", () => {
    const { extraByIdentity } = buildExtraPreservationMaps({
      p_0: participant({ name: "박하나", studentId: null, extra: "혼자" }),
      p_1: participant({ name: "김동명", studentId: null, extra: "겹침1" }),
      p_2: participant({ name: "김동명", studentId: null, extra: "겹침2" }),
    });
    expect(extraByIdentity.get("박하나|1부|1|1")).toBe("혼자");
    expect(extraByIdentity.get("김동명|1부|1|1")).toBeUndefined();
  });

  it("A4: extra가 없는 참가자는 어느 맵에도 들어가지 않는다", () => {
    const { extraByStudentId, extraByIdentity } = buildExtraPreservationMaps({
      p_0: participant({ studentId: "s1" }),
      p_1: participant({ name: "이빈칸", studentId: null, extra: "" }),
    });
    expect(extraByStudentId.size).toBe(0);
    expect(extraByIdentity.size).toBe(0);
  });

  it("A5: studentId 있는 참가자도 identity 맵에는 함께 등록된다 (현재 동작 고정)", () => {
    const { extraByIdentity } = buildExtraPreservationMaps({
      p_0: participant({ name: "최윤아", studentId: "s9", extra: "둘다" }),
    });
    expect(extraByIdentity.get("최윤아|1부|1|1")).toBe("둘다");
  });
});

describe("dedupeSheetParticipants — 사양 B (중복 제거)", () => {
  const s = student({ id: "1_S11_01", name: "홍길동" });
  const students = { [s.id]: s };

  it("B1: 같은 학생의 신청 2건 → 첫 건만 deduped, entries에는 2건 모두", () => {
    const first = participant({ registeredAt: "2026. 7. 1 오전 10:00:00" });
    const second = participant({ registeredAt: "2026. 7. 2 오전 10:00:00" });
    const { deduped, dupEntries } = dedupeSheetParticipants([first, second], students);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].p).toBe(first);
    expect(deduped[0].ms?.id).toBe("1_S11_01");
    expect(deduped[0].dedupKey).toBe("1_S11_01");
    const dup = dupEntries.get("1_S11_01")!;
    expect(dup.entries).toHaveLength(2);
    expect(dup.entries[0]).toBe(first);   // 첫 신청 unshift 포함
    expect(dup.entries[1]).toBe(second);
  });

  it("B2: 미매칭 신청은 name:{이름}:{bu}:{grade} 키로 중복 판정된다", () => {
    const a = participant({ name: "무명씨", grade: 2 });
    const b = participant({ name: "무명씨", grade: 2, class: 5 }); // class 달라도 같은 키
    const { deduped, dupEntries } = dedupeSheetParticipants([a, b], students);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].dedupKey).toBe("name:무명씨:1부:2");
    expect(dupEntries.get("name:무명씨:1부:2")!.entries).toHaveLength(2);
  });

  it("B3: 중복이 없으면 dupEntries는 비어 있다", () => {
    const { deduped, dupEntries } = dedupeSheetParticipants(
      [participant({}), participant({ name: "다른사람" })], students);
    expect(deduped).toHaveLength(2);
    expect(dupEntries.size).toBe(0);
  });
});
