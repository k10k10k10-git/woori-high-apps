import { describe, expect, it } from "vitest";
import type { ActivityLogRecord } from "./types";
import { humanizeActivityContext, presentActivityLog } from "./presentation";

function record(patch: Partial<ActivityLogRecord> = {}): ActivityLogRecord {
  return {
    id: "event-1",
    schemaVersion: 1,
    occurredAt: 1_800_000_000_000,
    recordedAt: 1_800_000_000_001,
    actor: { kind: "user", uid: "synthetic_actor_uid_000001", name: "가상관리자" },
    area: "newFriends",
    action: "update",
    target: { path: "semesters/2026-sunday/newFriends/id_0123456789abcdef", label: "새친구 외 1개 대상", context: "2026-sunday · 2개 대상" },
    changes: [
      { field: "새친구 id_0123456789abcdef · 이름·부서·성별", redacted: true },
      { field: "새친구 비공개 정보 id_0123456789abcdef · 생년월일·본인 연락처·보호자 연락처", redacted: true },
    ],
    changedCount: 2,
    ...patch,
  };
}

describe("활동 로그 사람용 표현", () => {
  it("기존 새친구 로그의 해시와 내부 학기 키를 한국어 업무 설명으로 바꾼다", () => {
    const result = presentActivityLog(record());
    expect(result.areaLabel).toBe("새친구");
    expect(result.targetLabel).toBe("새친구 관련 기록");
    expect(result.contextLabel).toBe("2026년 주일 운영");
    expect(result.summary).toBe("이름 · 부서 · 성별 외 3개 항목 저장");
    expect(result.countLabel).toBe("2건");
    expect(result.changes).toEqual([
      {
        title: "새친구 기본 정보",
        fields: ["이름", "부서", "성별"],
        redacted: true,
        description: "세부 값은 활동 로그에 기록하지 않았습니다.",
      },
      {
        title: "새친구 연락처·개인 정보",
        fields: ["생년월일", "본인 연락처", "보호자 연락처"],
        redacted: true,
        description: "세부 값은 활동 로그에 기록하지 않았습니다.",
      },
    ]);
    expect(result.searchText).toContain("보호자 연락처");
    expect(result.searchText).not.toMatch(/synthetic_actor_uid|id_012345|2026-sunday|semesters\//);
  });

  it("찬양팀 로그의 업무 영역과 권한 값을 한국어로 표시한다", () => {
    const result = presentActivityLog(record({
      area: "semester",
      target: { path: "praiseOps/workspace_1", label: "찬양팀 · 담당 계정·권한 변경" },
      changes: [{ field: "찬양팀 권한", before: "editor", after: "groupStaff" }],
      changedCount: 1,
    }));
    expect(result.areaLabel).toBe("찬양팀 운영");
    expect(result.summary).toBe("찬양팀 권한 · 편집 담당자 → 조 담당자");
    expect(result.changes[0]).toMatchObject({ before: "편집 담당자", after: "조 담당자" });
  });

  it("알 수 없는 찬양팀 권한 문자열은 객체 프로토타입을 조회하지 않고 문자열로 유지한다", () => {
    const result = presentActivityLog(record({
      area: "semester",
      target: { path: "praiseOps/workspace_1", label: "찬양팀 · 담당 계정·권한 변경" },
      changes: [{ field: "찬양팀 권한", before: "__proto__", after: "constructor" }],
      changedCount: 1,
    }));
    expect(result.changes[0]).toMatchObject({ before: "__proto__", after: "constructor" });
    expect(result.summary).toBe("찬양팀 권한 · __proto__ → constructor");
  });

  it("내부 식별자만 있는 문맥은 숨기고 날짜와 학기는 읽기 쉽게 바꾼다", () => {
    expect(humanizeActivityContext("2026-2 · 2026-09-05 · s1 · id_0123456789abcdef")).toBe("2026년 2학기 · 2026. 09. 05.");
    expect(humanizeActivityContext("synthetic_actor_uid_000001")).toBeUndefined();
  });

  it("구 writer가 남긴 짧은 복수 대상 키도 업무명에서 제거한다", () => {
    const result = presentActivityLog(record({
      target: { path: "retreats/r1/participants/p_0", label: "수련회 참가자 외 2개 대상", context: "r1 · 3개 대상" },
      changes: [
        { field: "수련회 참가자 p_0 · 이름·부서", redacted: true },
        { field: "학기 신청 1_student · 상태", redacted: true },
        { field: "새친구 friend-a · 학교", redacted: true },
      ],
      changedCount: 3,
    }));
    expect(result.targetLabel).toBe("수련회 참가자 관련 기록");
    expect(result.contextLabel).toBeUndefined();
    expect(result.countLabel).toBe("3건");
    expect(result.changes.map(change => change.title)).toEqual(["수련회 참가자", "학기 신청", "새친구 기본 정보"]);
    expect(result.searchText).not.toMatch(/p_0|1_student|friend-a/);
  });

  it("이전값만 남은 과거 기록을 새 저장값으로 표현하지 않는다", () => {
    const result = presentActivityLog(record({
      changes: [{ field: "출석", before: "출석" }],
      changedCount: 1,
    }));
    expect(result.summary).toBe("출석 · 저장 후 값 미기록");
  });

  it("삭제된 민감 항목은 이전 값을 꾸며내지 않고 기록하지 않았음을 설명한다", () => {
    const result = presentActivityLog(record({
      action: "delete",
      target: { path: "semesters/2026-2/applicationsPrivate/a1", label: "학기 신청" },
      changes: [{ field: "본인 연락처", redacted: true }],
      changedCount: 1,
    }));
    expect(result.changes[0].description).toBe("삭제 전 값은 활동 로그에 기록하지 않았습니다.");
  });
});
