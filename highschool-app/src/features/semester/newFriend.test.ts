import { describe, expect, it } from "vitest";
import {
  buildRosterStudent,
  buildNewFriendPlacementCancellationUpdates,
  buildNewFriendRosterRegistrationUpdates,
  buildNewFriendRosterRemovalUpdates,
  deriveNewFriendRosterProgress,
  deriveNewFriendStage,
  findNewFriendDuplicate,
  formatClassLabel,
  formatKoreanPhone,
  formatNewFriendGrade,
  koreaDateInputValue,
  matchesNewFriendSearch,
  needsClassAssignment,
  NEW_FRIEND_FAITH_STEP_OPTIONS,
  NEW_FRIEND_INVITER_OPTIONS,
  newFriendRegisteredDate,
  newFriendAssignmentCopyText,
  personIdForNewFriend,
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
    expect(deriveNewFriendStage(friend({ rosterSync: { studentId: "nf_1", classKey: "1-1-2", syncedAt: "now" } }))).toBe("완료");
    expect(deriveNewFriendStage(friend({ giftDate: "2026-08-16" }))).toBe("완료");
  });

  it("등록일은 수정값을 우선하고 기존 기록은 생성 시각의 한국 날짜로 보완한다", () => {
    expect(koreaDateInputValue(new Date("2026-08-29T15:30:00.000Z"))).toBe("2026-08-30");
    expect(newFriendRegisteredDate(friend({ createdAt: "2026-08-29T15:30:00.000Z" }))).toBe("2026-08-30");
    expect(newFriendRegisteredDate(friend({ registeredDate: "2026-08-28" }))).toBe("2026-08-28");
  });

  it("인도자와 신급 선택지는 운영 합의 순서로 고정한다", () => {
    expect(NEW_FRIEND_INVITER_OPTIONS).toEqual(["부모", "친구", "스스로", "기타"]);
    expect(NEW_FRIEND_FAITH_STEP_OPTIONS).toEqual([
      "아직 안함", "학습", "세례", "유아세례", "입교", "침례", "영세", "기억안남",
    ]);
  });

  it("출석부 반영을 기준으로 대기·처리중·완료를 표시한다", () => {
    expect(deriveNewFriendRosterProgress(friend())).toBe("대기");
    expect(deriveNewFriendRosterProgress(friend({ week2Date: "2026-08-09" }))).toBe("처리중");
    expect(deriveNewFriendRosterProgress(friend({ assignedClassKey: "2-1-9" }))).toBe("처리중");
    expect(deriveNewFriendRosterProgress(friend({ rosterSync: { studentId: "nf_1", classKey: "2-1-9", syncedAt: "now" } }))).toBe("완료");
  });

  it("연락처와 반을 읽기 좋은 형식으로 표시한다", () => {
    expect(formatKoreanPhone("01011112222")).toBe("010-1111-2222");
    expect(formatKoreanPhone("0311234567")).toBe("031-123-4567");
    expect(formatClassLabel("2-1-9")).toBe("2부 1학년 9반");
    expect(formatNewFriendGrade(2)).toBe("2학년");
    expect(formatNewFriendGrade(0)).toBe("학년 미입력");
  });

  it("2주차를 마치고 반이 없는 대상의 카카오톡 복사문을 만든다", () => {
    const target = friend({ name: "이다미", part: "2부", grade: 1, gender: "여", week2Date: "2026-08-09" });
    expect(needsClassAssignment(target)).toBe(true);
    expect(needsClassAssignment({ ...target, decision: "미등록" })).toBe(false);
    expect(newFriendAssignmentCopyText(target, { phone: "01011112222", parentPhone: "01033334444" })).toBe([
      "이름 : 이다미",
      "부서 : 2부",
      "학년 : 1학년",
      "성별 : 여",
      "학교 : ",
      "본인 연락처 : 010-1111-2222",
      "보호자 연락처 : 010-3333-4444",
    ].join("\n"));
  });

  it("출석부 미반영 상태에서는 새친구 기록을 유지하고 등반·배정만 해제한다", () => {
    expect(buildNewFriendPlacementCancellationUpdates({
      sid: "2026-sunday",
      friend: friend({ id: "friend-1", assignedClassKey: "1-1-1", giftDate: "2026-08-16" }),
      priv: { phone: "010-1111-2222" },
      student: null,
      attendance: null,
      canceledAt: "2026-08-11T13:30:00.000Z",
      operationId: "delete-test",
      canceledAtMs: 1786455000000,
    })).toEqual({
      "semesters/2026-sunday/newFriends/friend-1/assignedClassKey": null,
      "semesters/2026-sunday/newFriends/friend-1/giftDate": null,
      "semesters/2026-sunday/newFriends/friend-1/rosterSync": null,
      "semesters/2026-sunday/newFriends/friend-1/updatedAt": "2026-08-11T13:30:00.000Z",
    });
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
    expect(personIdForNewFriend("2026_new_1")).toBe("person_student_nf_2026_new_1");
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
      personId: "person_student_nf_2026_new_1",
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
      personId: "person_student_nf_2026_new_1",
      name: "새친구",
    });
    expect(updates["semesters/2026-2/newFriends/2026_new_1/rosterSync"]).toMatchObject({
      personId: "person_student_nf_2026_new_1",
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
      operationId: "delete-test",
      removedAtMs: 1786449600000,
      removedBy: "통합관리자",
    });

    expect(Object.keys(updates).sort()).toEqual([
      "attendance/2026/1-1-1/nf_2026_new_1",
      "classes/2026/1-1-1/students/nf_2026_new_1",
      "semesters/2026-sunday/newFriends/2026_new_1",
      "semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/removals/1786449600000",
      "semestersPrivate/2026-sunday/newFriendsPrivate/2026_new_1",
      "trash/2026/students/1-1-1__nf_2026_new_1__delete-test",
    ]);
    expect(updates["attendance/2026/1-1-1/nf_2026_new_1"]).toBeNull();
    expect(updates["trash/2026/students/1-1-1__nf_2026_new_1__delete-test"]).toMatchObject({
      name: "안정현",
      ck: "1-1-1",
      deletedAt: 1786449600000,
    });
    expect(updates["semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/removals/1786449600000"])
      .toMatchObject({ attendance: { "2026-08-09": "O" } });
  });

  it("등반·배정 취소는 새친구 기록을 보존하고 백업 후 명단·출석 연결만 해제한다", () => {
    const updates = buildNewFriendPlacementCancellationUpdates({
      sid: "2026-sunday",
      year: "2026",
      friend: { ...synced, giftDate: "2026-08-16" },
      priv: { phone: "010-1111-2222" },
      student: { id: "nf_2026_new_1", name: "안정현", phone: "010-1111-2222" },
      attendance: { "2026-08-09": "O" },
      canceledAt: "2026-08-11T13:30:00.000Z",
      operationId: "delete-test",
      canceledAtMs: 1786455000000,
      canceledBy: "통합관리자",
    });

    expect(Object.keys(updates).sort()).toEqual([
      "attendance/2026/1-1-1/nf_2026_new_1",
      "classes/2026/1-1-1/students/nf_2026_new_1",
      "semesters/2026-sunday/newFriends/2026_new_1/assignedClassKey",
      "semesters/2026-sunday/newFriends/2026_new_1/giftDate",
      "semesters/2026-sunday/newFriends/2026_new_1/rosterSync",
      "semesters/2026-sunday/newFriends/2026_new_1/updatedAt",
      "semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/placementCancellations/1786455000000",
      "trash/2026/students/1-1-1__nf_2026_new_1__delete-test",
    ]);
    expect(updates["semesters/2026-sunday/newFriends/2026_new_1"]).toBeUndefined();
    expect(updates["semestersPrivate/2026-sunday/newFriendsPrivate/2026_new_1"]).toBeUndefined();
    expect(updates["classes/2026/1-1-1/students/nf_2026_new_1"]).toBeNull();
    expect(updates["attendance/2026/1-1-1/nf_2026_new_1"]).toBeNull();
    expect(updates["trash/2026/students/1-1-1__nf_2026_new_1__delete-test"]).toMatchObject({
      name: "안정현",
      ck: "1-1-1",
      deletedAt: 1786455000000,
    });
    expect(updates["semestersPrivate/2026-sunday/newFriendRosterBackups/2026_new_1/placementCancellations/1786455000000"])
      .toMatchObject({
        attendance: { "2026-08-09": "O" },
        newFriendPrivate: { phone: "010-1111-2222" },
        createdBy: "통합관리자",
      });
  });
});

describe("새친구 목록 검색", () => {
  const target = friend({ name: "김 하늘", school: "우리High학교", owner: "이교사", part: "2부", grade: 2 });

  it("이름 일부와 공백·영문 대소문자를 무시하고 검색한다", () => {
    expect(matchesNewFriendSearch(target, " 김하늘 ")).toBe(true);
    expect(matchesNewFriendSearch(target, "하늘")).toBe(true);
    expect(matchesNewFriendSearch(target, "high")).toBe(true);
    expect(matchesNewFriendSearch(target, "없는학생")).toBe(false);
    expect(matchesNewFriendSearch(target, "   ")).toBe(true);
  });

  it("여러 조건은 같은 학생의 서로 다른 필드에서도 모두 일치해야 한다", () => {
    expect(matchesNewFriendSearch(target, "2부 2학년 이교사")).toBe(true);
    expect(matchesNewFriendSearch(target, "2부 1학년")).toBe(false);
    expect(matchesNewFriendSearch(target, "하늘 다른학교")).toBe(false);
  });

  it("전달된 본인·보호자 연락처를 하이픈 유무와 무관하게 검색한다", () => {
    const priv = { phone: "010-0000-1234", parentPhone: "01000005678" };
    expect(matchesNewFriendSearch(target, "01000001234", priv)).toBe(true);
    expect(matchesNewFriendSearch(target, "010-0000-5678", priv)).toBe(true);
    expect(matchesNewFriendSearch(target, "하늘 5678", priv)).toBe(true);
    expect(matchesNewFriendSearch(target, "5678")).toBe(false);
  });

  it("목록에 표시하지 않는 심방·가족 메모와 주소는 검색에 포함하지 않는다", () => {
    expect(matchesNewFriendSearch(target, "민감내용", {
      pastoralNotes: "민감내용", familyNotes: "민감내용", teamMemo: "민감내용", address: "민감내용",
    })).toBe(false);
  });

  it("같은 ID의 다른 학생도 각각의 원본 정보로 검색한다", () => {
    const other = friend({ name: "박바다", school: "새학교" });
    expect([target, other].filter((item) => matchesNewFriendSearch(item, "바다"))).toEqual([other]);
  });
});

it('서로 다른 삭제 작업은 학생 원장 ID를 유지하며 별도 휴지통 사본을 만든다', () => {
  const record = friend({ rosterSync: { studentId: 'nf_same', classKey: '1-1-1', syncedAt: 'now' } });
  const input = { sid: '2026-sunday', year: '2026', friend: record, priv: {}, student: { id: 'nf_same', name: record.name }, attendance: {}, removedAt: 'now', removedAtMs: 1 };
  const one = buildNewFriendRosterRemovalUpdates({ ...input, operationId: 'first' });
  const two = buildNewFriendRosterRemovalUpdates({ ...input, operationId: 'second' });
  expect(one['trash/2026/students/1-1-1__nf_same__first']).toMatchObject({ id: 'nf_same', ck: '1-1-1' });
  expect(two['trash/2026/students/1-1-1__nf_same__second']).toMatchObject({ id: 'nf_same', ck: '1-1-1' });
  expect(one['classes/2026/1-1-1/students/nf_same']).toBeNull();
});
