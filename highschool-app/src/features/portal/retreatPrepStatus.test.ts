import { describe, expect, it } from "vitest";
import { buildRetreatPrepStatus } from "./retreatPrepStatus";
import type { Group, Participant, Room, Student } from "@/lib/types";

const participant = (name: string, studentId?: string | null): Participant => ({
  name,
  gender: "남",
  grade: 1,
  class: 1,
  bu: "1부",
  studentId: studentId ?? null,
  registeredAt: "2026-08-01",
});

const group = (studentIds: string[]): Group => ({
  id: "g1", name: "1조", bu: "1부", teachers: [], leader: "", studentIds,
});

const room = (studentIds: string[]): Room => ({
  id: "r1", roomNumber: "101", capacity: 6, type: "남", studentIds,
});

const student = (id: string): Student => ({
  id,
  name: `학생${id}`,
  num: 1,
  grade: 1,
  class: 1,
  buNum: 1,
  birth: "",
  phone: "",
  pPhone: "",
  addr: "",
  photo: "",
  school: "",
});

const stageOf = (status: ReturnType<typeof buildRetreatPrepStatus>, key: string) =>
  status.stages.find((s) => s.key === key)!;

describe("buildRetreatPrepStatus", () => {
  it("미매칭 신청을 검토 단계로 세고 편성 모집단에서는 제외한다", () => {
    const status = buildRetreatPrepStatus({
      participants: {
        a: participant("김하늘", "s1"),
        b: participant("이바다"), // 학생 원장 미매칭
      },
      groups: [group(["s1"])],
      rooms: [room(["s1"])],
    });

    expect(stageOf(status, "review").count).toBe(1);
    expect(stageOf(status, "roster").count).toBe(2);
    // 미매칭 1명은 조·방 미배정으로 이중 계상되지 않는다.
    expect(stageOf(status, "groups").count).toBe(0);
    expect(stageOf(status, "groups").total).toBe(1);
    expect(stageOf(status, "rooms").count).toBe(0);
    expect(status.attentionCount).toBe(1);
  });

  it("조·방에 배정되지 않은 학생을 각 단계에서 센다", () => {
    const status = buildRetreatPrepStatus({
      participants: {
        a: participant("김하늘", "s1"),
        b: participant("이바다", "s2"),
        c: participant("박도담", "s3"),
      },
      groups: [group(["s1", "s2"])],
      rooms: [room(["s1"])],
    });

    expect(stageOf(status, "groups").count).toBe(1);
    expect(stageOf(status, "rooms").count).toBe(2);
    expect(status.attentionCount).toBe(2);
  });

  it("모두 정리되면 남은 일이 없다고 판정한다", () => {
    const status = buildRetreatPrepStatus({
      participants: { a: participant("김하늘", "s1") },
      groups: [group(["s1"])],
      rooms: [room(["s1"])],
    });

    expect(status.attentionCount).toBe(0);
    expect(stageOf(status, "groups").tone).toBe("done");
    expect(stageOf(status, "rooms").tone).toBe("done");
  });

  it("빈 명단에서도 0으로 나누지 않고 안내 문구를 준다", () => {
    const status = buildRetreatPrepStatus({ participants: {}, groups: [], rooms: [] });

    expect(status.attentionCount).toBe(0);
    expect(stageOf(status, "roster").detail).toBe("신청 0명");
    expect(stageOf(status, "groups").detail).toBe("편성할 인원이 아직 없습니다");
  });

  it("빈 studentId 문자열은 배정으로 세지 않는다", () => {
    const status = buildRetreatPrepStatus({
      participants: { a: participant("김하늘", "s1") },
      groups: [group(["", "s9"])],
      rooms: [],
    });

    expect(stageOf(status, "groups").count).toBe(1);
  });

  it("실제 편성 화면처럼 중복 신청·취소·당일참석을 반영한다", () => {
    const status = buildRetreatPrepStatus({
      participants: {
        a: participant("김하늘", "s1"),
        aDuplicate: participant("김하늘", "s1"),
        b: participant("이바다", "s2"),
        c: participant("박도담", "s3"),
        d: participant("최아람", "s4"),
      },
      groups: [group(["s1", "s3"])],
      rooms: [room(["s1"])],
      students: { s1: student("s1"), s2: student("s2"), s3: student("s3"), s4: student("s4") },
      cellColors: { s2: "red" },
      partialAttendances: [{ id: "s3", type: "당일참석", day: 1 }],
    });

    // s1 중복 신청은 한 명으로 계산하고, 취소자 s2는 두 편성에서 제외한다.
    expect(stageOf(status, "groups").count).toBe(1);
    // 방배정에서는 당일참석 s3도 제외되어 실제 미배정 학생은 s4 한 명이다.
    expect(stageOf(status, "rooms").count).toBe(1);
  });

  it("후기 신청자는 실제 편성 화면과 같이 미배정에 포함한다", () => {
    const status = buildRetreatPrepStatus({
      participants: { a: participant("김하늘", "s1") },
      groups: [group(["s1"])],
      rooms: [room(["s1"])],
      students: { s1: student("s1"), late: student("late") },
      cellColors: { late: "blue" },
    });

    expect(stageOf(status, "groups").count).toBe(1);
    expect(stageOf(status, "rooms").count).toBe(1);
  });
});
