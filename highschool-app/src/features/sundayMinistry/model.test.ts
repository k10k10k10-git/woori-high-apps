import { describe, expect, it } from "vitest";
import {
  collectSundayAdminChanges,
  collectSundayNewFriends,
  collectSundayNewFriendsPrivate,
  privateValueForSundayFriend,
  sundayFriendKey,
  sundayStorageIds,
  sundayWorkspaceId,
} from "./model";

describe("주일 사역 새친구 통합 모델", () => {
  it("학기와 주일 전용 작업공간의 기록을 학기 구분 없이 합친다", () => {
    const friends = collectSundayNewFriends({
      "2026-1": { newFriends: { same: { name: "김봄", part: "1부", grade: 1, decision: "미정", createdAt: "2026-03-01" } } },
      "2026-sunday": { newFriends: { same: { name: "박여름", part: "2부", grade: 2, decision: "등록", createdAt: "2026-08-01" } } },
    });

    expect(friends.map((friend) => [friend.name, friend.storageSid])).toEqual([
      ["박여름", "2026-sunday"],
      ["김봄", "2026-1"],
    ]);
    expect(sundayFriendKey(friends[0].storageSid, friends[0].id)).not.toBe(sundayFriendKey(friends[1].storageSid, friends[1].id));
  });

  it("비공개 정보를 저장 작업공간과 기록 ID로 구분한다", () => {
    const privateMap = collectSundayNewFriendsPrivate({
      "2026-1": { newFriendsPrivate: { same: { phone: "010-1111" } } },
      "2026-sunday": { newFriendsPrivate: { same: { phone: "010-2222" } } },
    });

    expect(privateValueForSundayFriend(privateMap, {
      id: "same", storageSid: "2026-sunday", name: "박여름", part: "2부", grade: 2,
      decision: "미정", createdAt: "2026-08-01",
    })?.phone).toBe("010-2222");
  });

  it("신규 작성은 학기가 아닌 연도별 주일 작업공간을 사용한다", () => {
    expect(sundayWorkspaceId(2026)).toBe("2026-sunday");
    expect(sundayStorageIds(["2025-2", "2026-1", "2026-2"], 2026)).toEqual([
      "2025-2", "2025-sunday", "2026-1", "2026-2", "2026-sunday",
    ]);
  });

  it("출석부 반 내부의 행정 변동 기록을 연도·반을 포함해 최신순으로 모은다", () => {
    const changes = collectSundayAdminChanges({
      2026: {
        "1-1-1": { adminChanges: { old: { changedAt: "2026-08-10T00:00:00.000Z", changedAtMs: 10, studentName: "김학생", changeSummary: "학교 수정", teacher: "박교사", action: "학생 정보 수정", result: "반영 완료", actor: "관리자" } } },
        "2-1-9": { adminChanges: { recent: { changedAt: "2026-08-11T00:00:00.000Z", changedAtMs: 20, studentName: "이학생", changeSummary: "반 이동", teacher: "이교사", action: "반 이동", result: "반영 완료", actor: "김수현" } } },
      },
    });

    expect(changes.map((change) => [change.id, change.year, change.classKey])).toEqual([
      ["recent", "2026", "2-1-9"],
      ["old", "2026", "1-1-1"],
    ]);
  });
});
