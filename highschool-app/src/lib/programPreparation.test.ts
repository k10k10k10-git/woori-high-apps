import { describe, expect, it, vi } from "vitest";
import { createProgramDraft, programReadiness, programTasks, sortRetreatPrograms } from "./programPreparation";
import type { RetreatProgram } from "./types";

const base = (overrides: Partial<RetreatProgram> = {}): RetreatProgram => ({
  id: "p1",
  order: 1,
  title: "공동체 프로그램",
  kind: "main",
  status: "draft",
  createdAt: 10,
  updatedAt: 10,
  ...overrides,
});

describe("수련회 프로그램 준비", () => {
  it("기본 초안은 순서와 제목을 일치시킨다", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    expect(createProgramDraft(2)).toEqual({
      order: 2,
      title: "프로그램 2",
      kind: "main",
      status: "draft",
      createdAt: 100,
      updatedAt: 100,
    });
    vi.restoreAllMocks();
  });

  it("순서→생성 시각→ID 순으로 안정적으로 정렬한다", () => {
    const result = sortRetreatPrograms([
      base({ id: "b", order: 2, createdAt: 20 }),
      base({ id: "c", order: 1, createdAt: 30 }),
      base({ id: "a", order: 1, createdAt: 20 }),
    ]);
    expect(result.map((program) => program.id)).toEqual(["a", "c", "b"]);
  });

  it("현장 준비에 필요한 6가지 핵심 항목을 점검한다", () => {
    const readiness = programReadiness(base({
      date: "2026-08-08",
      startTime: "14:00",
      place: "본당",
      lead: "김성훈",
      objective: "서로 협력한다.",
      flow: "오프닝\n본 활동\n마무리",
      rules: "안전 수칙을 지킨니다.",
      briefing: "교사 역할을 안내합니다.",
    }));
    expect(readiness).toMatchObject({ ready: 6, total: 6, percent: 100, missingLabels: [] });
  });

  it("할 일은 생성 순으로 표시한다", () => {
    const tasks = programTasks(base({ tasks: {
      later: { title: "나중", done: false, createdAt: 20, updatedAt: 20 },
      first: { title: "먼저", done: true, createdAt: 10, updatedAt: 10 },
    } as unknown as RetreatProgram["tasks"] }));
    expect(tasks.map((task) => task.title)).toEqual(["먼저", "나중"]);
    expect(tasks.map((task) => task.id)).toEqual(["first", "later"]);
  });
});
