import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEGMENT_LABEL,
  isAssignedMovement,
  isDefaultSegment,
  movementsForDefaultSegments,
} from "@/lib/defaultSegment";
import type { IguardMovement, IguardSegment } from "@/lib/types";

function segment(overrides: Partial<IguardSegment> = {}): IguardSegment {
  return {
    id: "segment-default",
    blockId: "block-1",
    order: 0,
    label: DEFAULT_SEGMENT_LABEL,
    ...overrides,
  };
}

function movement(overrides: Partial<IguardMovement> = {}): IguardMovement {
  return {
    id: "staff-1__block-1",
    blockId: "block-1",
    postId: "post-1",
    staffId: "staff-1",
    ...overrides,
  };
}

describe("기본 구간 하위호환 어댑터", () => {
  it("segmentId가 없는 구버전 동선을 그대로 읽는다", () => {
    const legacy = movement();
    expect(movementsForDefaultSegments([], [legacy])).toEqual([legacy]);
  });

  it("새 모델에서는 order=0,label=전체인 기본 구간 동선만 읽는다", () => {
    const defaultSegment = segment();
    const phaseSegment = segment({ id: "segment-phase", order: 1, label: "식당 → 숙소" });
    const defaultMovement = movement({ id: "default-movement", segmentId: defaultSegment.id });
    const phaseMovement = movement({ id: "phase-movement", segmentId: phaseSegment.id });

    expect(movementsForDefaultSegments(
      [phaseSegment, defaultSegment],
      [phaseMovement, defaultMovement],
    )).toEqual([defaultMovement]);
  });

  it("기본 구간이라도 담당 미정 슬롯은 기존 화면에서 제외한다", () => {
    const defaultSegment = segment();
    const pending = movement({
      id: "pending",
      segmentId: defaultSegment.id,
      staffId: null,
      slot: 0,
    });

    expect(isAssignedMovement(pending)).toBe(false);
    expect(movementsForDefaultSegments([defaultSegment], [pending])).toEqual([]);
  });

  it("참조 구간을 찾을 수 없는 새 동선은 다른 구간으로 오인해 표시하지 않는다", () => {
    const orphan = movement({ segmentId: "missing-segment" });
    expect(movementsForDefaultSegments([], [orphan])).toEqual([]);
  });

  it("기본 구간 표시는 공백을 허용하지만 order=0 조건을 함께 요구한다", () => {
    expect(isDefaultSegment(segment({ label: " 전체 " }))).toBe(true);
    expect(isDefaultSegment(segment({ order: 1 }))).toBe(false);
  });
});
