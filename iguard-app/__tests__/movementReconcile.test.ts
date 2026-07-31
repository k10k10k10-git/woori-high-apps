import { describe, expect, it } from "vitest";
import { looksLikeLegacySheetMovement, reconcileSegmentSheetMovements, reconcileSheetMovements } from "@/lib/movementReconcile";
import { type AutoAssignment } from "@/lib/cueSheet";
import { type AssignedIguardMovement, type IguardMovement } from "@/lib/types";

const previousLunch: AutoAssignment = {
  staffId: "choi",
  postId: "exit-1f",
  round: "선밥",
  note: "1층 퇴식구: 최성우sf",
};

function movement(overrides: Partial<AssignedIguardMovement> = {}): AssignedIguardMovement {
  return {
    id: "choi__lunch",
    staffId: "choi",
    blockId: "lunch",
    postId: "exit-1f",
    round: "선밥",
    note: "1층 퇴식구: 최성우sf",
    ...overrides,
  };
}

describe("reconcileSheetMovements — 시트 자동배정 정합성", () => {
  it("시트에서 삭제된 명시적 자동배정은 제거한다", () => {
    const existing = movement({ source: "sheet" });
    const result = reconcileSheetMovements([existing], [previousLunch], []);
    expect(result.removes).toEqual([existing]);
    expect(result.upserts).toEqual([]);
  });

  it("수동배정은 새 시트에서 없어도 보존한다", () => {
    const existing = movement({ source: "manual" });
    expect(reconcileSheetMovements([existing], [previousLunch], [])).toEqual({ removes: [], upserts: [] });
  });

  it("출처가 없는 레거시 배정도 이전 자동배정과 정확히 같으면 제거한다", () => {
    const existing = movement();
    expect(reconcileSheetMovements([existing], [previousLunch], []).removes).toEqual([existing]);
  });

  it("출처가 없는 배정의 메모가 다르면 수동배정으로 보고 보존한다", () => {
    const existing = movement({ note: "현장 수동 지정" });
    expect(reconcileSheetMovements([existing], [previousLunch], [])).toEqual({ removes: [], upserts: [] });
  });

  it("현재 블록 본문이 이미 비어도 포스트명:스탭명 형태의 레거시 자동배정을 식별한다", () => {
    const existing = movement();
    expect(looksLikeLegacySheetMovement(existing, "최성우", "퇴식구")).toBe(true);
    expect(reconcileSheetMovements([existing], [], [], new Set([existing.id])).removes).toEqual([existing]);
  });

  it("포스트 또는 스탭 이름이 다른 구조화 메모는 자동배정으로 오인하지 않는다", () => {
    const existing = movement();
    expect(looksLikeLegacySheetMovement(existing, "김성우", "퇴식구")).toBe(false);
    expect(looksLikeLegacySheetMovement(existing, "최성우", "배식구")).toBe(false);
  });

  it("출처가 없는 비스탭 actor도 기존 담당 메모와 정확히 일치하면 자동동선으로 식별한다", () => {
    const existing: IguardMovement = {
      id: "legacy-admin",
      blockId: "service",
      segmentId: "default",
      postId: "pledge",
      actor: "행정팀",
      note: "서약서 및 불펜 준비: 행정팀",
    };
    expect(looksLikeLegacySheetMovement(existing, existing.actor || undefined, "서약서 및 불펜 준비")).toBe(true);
    expect(looksLikeLegacySheetMovement(existing, existing.actor || undefined, "다른 역할")).toBe(false);
  });

  it("시트 자동배정의 포스트가 바뀌면 새 값으로 갱신한다", () => {
    const existing = movement({ source: "sheet" });
    const next = { ...previousLunch, postId: "exit-2f", note: "2층 퇴식구: 최성우sf" };
    expect(reconcileSheetMovements([existing], [previousLunch], [next]).upserts).toEqual([
      { ...next, source: "sheet" },
    ]);
  });

  it("비어 있는 스탭 칸에는 새 시트 자동배정을 추가한다", () => {
    expect(reconcileSheetMovements([], [], [previousLunch]).upserts).toEqual([
      { ...previousLunch, source: "sheet" },
    ]);
  });

  it("유지되는 레거시 자동배정에는 source=sheet를 기록한다", () => {
    expect(reconcileSheetMovements([movement()], [previousLunch], [previousLunch]).upserts).toEqual([
      { ...previousLunch, source: "sheet" },
    ]);
  });
});

describe("reconcileSegmentSheetMovements — 구간 단위 수동 보존", () => {
  const sheetMovement: IguardMovement = {
    id: "seg__post__staff",
    segmentId: "seg",
    blockId: "block",
    postId: "post",
    staffId: "staff",
    detail: "1층",
    source: "sheet",
  };

  it("시트에서 사라진 자동 동선만 제거하고 수동 동선은 보존한다", () => {
    const manual = { ...sheetMovement, id: "manual", staffId: "manual-staff", source: "manual" as const };
    expect(reconcileSegmentSheetMovements([sheetMovement, manual], [])).toEqual({
      removes: [sheetMovement],
      upserts: [],
    });
  });

  it("같은 자연키의 상세가 바뀌면 갱신한다", () => {
    const next = {
      segmentId: "seg",
      blockId: "block",
      postId: "post",
      staffId: "staff",
      detail: "2층",
    };
    expect(reconcileSegmentSheetMovements([sheetMovement], [next]).upserts).toEqual([
      { ...next, source: "sheet" },
    ]);
  });

  it("담당 미정과 actor 슬롯도 각각 안정적인 자연키로 대조한다", () => {
    const tbd = { segmentId: "seg", blockId: "block", postId: "lobby", staffId: null, slot: 1 };
    const actor = { segmentId: "seg", blockId: "block", postId: "water", actor: "행정팀", slot: 1 };
    expect(reconcileSegmentSheetMovements([], [tbd, actor]).upserts).toEqual([
      { ...tbd, source: "sheet" },
      { ...actor, source: "sheet" },
    ]);
  });
});
