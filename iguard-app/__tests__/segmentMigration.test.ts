import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  EXECUTE_CONFIRMATION,
  buildRetreatMigration,
  createPushIdGenerator,
  parseArgs,
  selectRetreats,
} = require("../scripts/migrate-iguard-segments.js") as {
  EXECUTE_CONFIRMATION: string;
  buildRetreatMigration: (
    retreatId: string,
    retreat: Record<string, unknown>,
    generatePushId?: () => string,
  ) => {
    report: Record<string, number | boolean | unknown[]>;
    payload: Record<string, unknown>;
    restore: Record<string, unknown>;
  };
  createPushIdGenerator: (random?: () => number) => (now?: number) => string;
  parseArgs: (argv: string[]) => {
    retreatIds: string[];
    all: boolean;
    execute: boolean;
    confirmation: string;
  };
  selectRetreats: (
    args: { all: boolean; retreatIds: string[] },
    retreats: Record<string, unknown>,
  ) => string[];
};

function legacyRetreat(): {
  name: string;
  iguard: {
    schedule: Record<string, Record<string, unknown>>;
    movements: Record<string, Record<string, unknown>>;
    segments?: Record<string, Record<string, unknown>>;
  };
} {
  return {
    name: "여름수련회",
    iguard: {
      schedule: {
        "block-1": { day: 1, start: "09:00", label: "등록" },
        "block-2": { day: 1, start: "10:00", label: "집회" },
      },
      movements: {
        "staff-1__block-1": {
          staffId: "staff-1",
          blockId: "block-1",
          postId: "post-1",
          round: "선밥",
          note: "기존 메모",
          source: "manual",
        },
        "staff-2__block-2": {
          staffId: "staff-2",
          blockId: "block-2",
          postId: "post-2",
          source: "sheet",
        },
      },
    },
  };
}

describe("구간 마이그레이션 생성기", () => {
  it("블록별 기본 구간을 만들고 레거시 동선을 무손실 복합키로 옮긴다", () => {
    const ids = ["segment-1", "segment-2"];
    const result = buildRetreatMigration("retreat-1", legacyRetreat(), () => ids.shift()!);

    expect(result.report).toMatchObject({
      scheduleBlockCount: 2,
      generatedDefaultSegmentCount: 2,
      beforeMovementCount: 2,
      convertedMovementCount: 2,
      afterMovementCount: 2,
      countMatches: true,
      issueCount: 0,
    });
    expect(result.payload["retreats/retreat-1/iguard/segments/segment-1"]).toEqual({
      blockId: "block-1",
      order: 0,
      label: "전체",
      source: "manual",
    });
    expect(result.payload["retreats/retreat-1/iguard/movements/staff-1__block-1"]).toBeNull();
    expect(result.payload["retreats/retreat-1/iguard/movements/segment-1__post-1__staff-1"]).toEqual({
      staffId: "staff-1",
      blockId: "block-1",
      postId: "post-1",
      segmentId: "segment-1",
      round: "선밥",
      note: "기존 메모",
      source: "manual",
    });
    expect(result.restore["retreats/retreat-1/iguard/movements/staff-1__block-1"])
      .toEqual(legacyRetreat().iguard.movements["staff-1__block-1"]);
    expect(result.restore["retreats/retreat-1/iguard/movements/segment-1__post-1__staff-1"])
      .toBeNull();
  });

  it("이미 구조화된 동선과 기존 기본 구간은 다시 만들거나 이동하지 않는다", () => {
    const retreat = legacyRetreat();
    retreat.iguard = {
      ...retreat.iguard,
      segments: {
        "existing-default": {
          blockId: "block-1",
          order: 0,
          label: "전체",
          source: "manual",
        },
      },
      movements: {
        "structured": {
          staffId: "staff-1",
          blockId: "block-1",
          segmentId: "existing-default",
          postId: "post-1",
        },
      },
    };

    const result = buildRetreatMigration("retreat-1", retreat, () => "segment-2");
    expect(result.report).toMatchObject({
      reusedDefaultSegmentCount: 1,
      generatedDefaultSegmentCount: 1,
      structuredMovementCount: 1,
      convertedMovementCount: 0,
      issueCount: 0,
    });
    expect(Object.keys(result.payload).some(key => key.endsWith("/movements/structured"))).toBe(false);
  });

  it("스케줄 블록이 없거나 필수 키가 없는 레거시 동선은 실행 차단 이슈로 남긴다", () => {
    const retreat = {
      iguard: {
        schedule: {},
        movements: {
          broken: { blockId: "missing", postId: "post-1", staffId: "staff-1" },
        },
      },
    };
    const result = buildRetreatMigration("retreat-1", retreat, () => "unused");
    expect(result.report).toMatchObject({
      beforeMovementCount: 1,
      convertedMovementCount: 0,
      unresolvedLegacyCount: 1,
      issueCount: 1,
    });
    expect(result.payload).toEqual({});
  });

  it("존재하지 않는 구간을 참조하는 구조화 동선도 실행을 차단한다", () => {
    const retreat = {
      iguard: {
        schedule: {
          "block-1": { day: 1, start: "09:00", label: "등록" },
        },
        segments: {},
        movements: {
          structured: {
            segmentId: "missing-segment",
            blockId: "block-1",
            postId: "post-1",
            staffId: "staff-1",
          },
        },
      },
    };
    const result = buildRetreatMigration("retreat-1", retreat, () => "segment-1");
    expect(result.report).toMatchObject({
      structuredMovementCount: 1,
      issueCount: 1,
      fullyConverted: false,
      issues: [{
        type: "structured-movement-without-segment",
        movementKey: "structured",
        segmentId: "missing-segment",
      }],
    });
  });

  it("실행 모드는 확인 토큰 없이는 파싱 단계에서 거부한다", () => {
    expect(() => parseArgs(["node", "script", "--retreat-id", "r1", "--execute"]))
      .toThrow(`--confirm ${EXECUTE_CONFIRMATION}`);
    expect(parseArgs([
      "node",
      "script",
      "--retreat-id",
      "r1",
      "--execute",
      "--confirm",
      EXECUTE_CONFIRMATION,
    ])).toMatchObject({ retreatIds: ["r1"], execute: true });
  });

  it("--all은 실제 기존 동선이 있는 수련회만 대상으로 고른다", () => {
    const retreats = {
      r1: { iguard: { movements: { m1: {} } } },
      r2: { iguard: { schedule: { b1: {} }, movements: {} } },
      r3: {},
    };
    expect(selectRetreats({ all: true, retreatIds: [] }, retreats)).toEqual(["r1"]);
  });

  it("로컬 생성 push id는 20자 안전 문자이며 같은 시각에도 중복되지 않는다", () => {
    const generate = createPushIdGenerator(() => 0.25);
    const first = generate(1_700_000_000_000);
    const second = generate(1_700_000_000_000);
    expect(first).toMatch(/^[-0-9A-Z_a-z]{20}$/);
    expect(second).toMatch(/^[-0-9A-Z_a-z]{20}$/);
    expect(second).not.toBe(first);
  });
});
