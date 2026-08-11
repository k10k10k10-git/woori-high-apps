import { describe, expect, it } from "vitest";
import {
  buildRosterStudent,
  buildNewFriendRosterRegistrationUpdates,
  buildNewFriendRosterRemovalUpdates,
  deriveNewFriendStage,
  findNewFriendDuplicate,
  studentIdForNewFriend,
  validateNewFriendRosterRegistration,
  validateNewFriendRosterRemoval,
} from "./newFriend";
import type { ClassInfo, NewFriend } from "./types";

const friend = (partial: Partial<NewFriend> = {}): NewFriend => ({
  id: "2026_new_1",
  name: "새친구",
  part: "1부",
  grade: 1,
  decision: "미정",
  createdAt: "2026-08-11T00:00:00.000Z",
  ...partial,
});

describe("새친구 진행 단계", () => {
  it("주차·등록·반배정·원장 반영 상태를 순서대로 파생한다", () => {
    expect(deriveNewFriendStage(friend())).toBe("1주차");
    expect(deriveNewFriendStage(friend({ week1Date: "2026-08-02" }))).toBe("2주차");
    expect(deriveNewFriendStage(friend({ week1Date: "2026-08-02", week2Date: "2026-08-09" }))).toBe("등록 결정");
    expect(deriveNewFriendStage(friend({ decision: "등록" }))).toBe("반배정");
    expect(deriveNewFriendStage(friend({ decision: "등록", assignedClassKey: "1-1-2" }))).toBe("출석부 반영");
    expect(deriveNewFriendStage(friend({ rosterSync: { studentId: "nf_1", classKey: "1-1-2", syncedAt: "now" } }))).toBe("등반 확인");
    expect(deriveNewFriendStage(friend({ giftDate: "2026-08-16" }))).toBe("완료");
  });
});

describe("출석부 자동 반영 계획", () => {
  const classes: ClassInfo[] = [{
    classKey: "1-1-2",
    teacher: "담임",
    students: {
      existing: { name: "홍길동", birth: "2010-01-01", phone: "010-1111-2222" },
    },
  }];

  it("친구 ID에서 재클릭해도 같은 학생 ID를 만든다", () => {
    expect(studentIdForNewFriend("2026_new_1")).toBe("nf_2026_new_1");
    expect(studentIdForNewFriend("2026_new_1")).toBe("nf_2026_new_1");
  });

  it("같은 이름과 생년월일이면 덮어쓰지 않고 중복 후보로 막는다", () => {
    expect(findNewFriendDuplicate(classes, friend({ name: "홍 길동" }), { birth: "2010.01.01" }))
      .toMatchObject({ studentId: "existing", reason: "동일 인물 가능성이 높음" });
  });

  it("출석부 학생 객체에는 민감정보를 필요한 필드로만 매핑한다", () => {
    expect(buildRosterStudent("nf_1", friend({ school: "우리학교" }), {
      birth: "2010-01-01",
      phone: "010-1111-2222",
      parentPhone: "010-3333-4444",
      address: "성남시",
      pastoralNotes: "비공개 심방 메모",
    })).toEqual({
      id: "nf_1",
      name: "새친구",
      birth: "2010-01-01",
      phone: "010-1111-2222",
      pphone: "010-3333-4444",
      school: "우리학교",
      addr: "성남시",
    });
  });

  it("2주 과정·등록 결정·반배정이 모두 끝나야 반영할 수 있다", () => {
    expect(validateNewFriendRosterRegistration(friend({ decision: "등록", assignedClassKey: "1-1-2" })))
      .toContain("1주차");
    expect(validateNewFriendRosterRegistration(friend({
      decision: "등록",
      week1Date: "2026-08-02",
      week2Date: "2026-08-09",
      assignedClassKey: "1-1-2",
    }))).toBeNull();
  });

  it("사전 스냅샷·단일 학생·반영 이력을 한 루트 update로 계획한다", () => {
    const ready = friend({
      decision: "등록",
      week1Date: "2026-08-02",
      week2Date: "2026-08-09",
      assignedClassKey: "1-1-2",
    });
    const updates = buildNewFriendRosterRegistrationUpdates({
      sid: "2026-2",
      year: "2026",
      friend: ready,
      priv: { phone: "010-1111-2222" },
      studentId: "nf_2026_new_1",
      classKey: "1-1-2",
      syncedAt: "2026-08-11T10:00:00.000Z",
      syncedBy: "통합관리자",
    });

    expect(Object.keys(updates).sort()).toEqual([
      "classes/2026/1-1-2/students/nf_2026_new_1",
      "semesters/2026-2/newFriends/2026_new_1/rosterSync",
      "semesters/2026-2/newFriends/2026_new_1/updatedAt",
      "semestersPrivate/2026-2/newFriendRosterBackups/2026_new_1",
    ]);
    expect(updates["classes/2026/1-1-2/students/nf_2026_new_1"]).toMatchObject({
      id: "nf_2026_new_1",
      name: "새친구",
    });
  });
});

describe("출석부 반영 새친구 삭제 계획", () => {
  const synced = friend({
    name: "안정현",
    decision: "등록",
    assignedClassKey: "1-1-1",
    rosterSync: {
      studentId: "nf_2026_new_1",
      classKey: "1-1-1",
      syncedAt: "2026-08-11T10:00:00.000Z",
    },
  });

  it("새친구 결정적 ID와 연결된 학생만 삭제한다", () => {
    expect(validateNewFriendRosterRemoval(synced, { id: "nf_2026_new_1", name: "안 정현" })).toBeNull();
    expect(validateNewFriendRosterRemoval({
      ...synced,
      rosterSync: { ...synced.rosterSync!, studentId: "other" },
    }, { id: "other", name: "안정현" })).toContain("학생 ID");
    expect(validateNewFriendRosterRemoval(synced, { id: "nf_2026_new_1", name: "다른 학생" })).toContain("이름");
  });

  it("비공개 사전 백업·출석부 휴지통·학생·출석·새친구를 하나의 루트 update로 계획한다", () => {
    const updates = buildNewFriendRosterRemovalUpdates({
      sid: "2026-sunday",
      year: "2026",
      friend: synced,
      priv: { phone: "010-1111-2222" },
      student: { id: "nf_2026_new_1", name: "안정현", phone: "010-1111-2222" },
      attendance: { "2026-08-09": "O" },
      removedAt: "2026-08-11T12:00:00.000Z",
      removedAtMs: 1786449600000,
      removedBy: "통합관리자",
    });

    expect(Object.keys(updates).sort()).toEqual([
      "attendance/2026/1-1-1/nf_2026_new_1",
      "classes/2026/1-1-1/students/nf_2026_new_1",
      "semesters/2026-sunday/newFriends/2026_new_1",
      "semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/removals/1786449600000",
      "semestersPrivate/2026-sunday/newFriendsPrivate/2026_new_1",
      "trash/2026/students/nf_2026_new_1",
    ]);
    expect(updates["attendance/2026/1-1-1/nf_2026_new_1"]).toBeNull();
    expect(updates["trash/2026/students/nf_2026_new_1"]).toMatchObject({
      name: "안정현",
      ck: "1-1-1",
      deletedAt: 1786449600000,
    });
    expect(updates["semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/removals/1786449600000"])
      .toMatchObject({ attendance: { "2026-08-09": "O" } });
  });
});
