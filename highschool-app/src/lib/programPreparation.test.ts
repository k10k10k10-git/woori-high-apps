import { describe, expect, it, vi } from "vitest";
import {
  PROGRAM_ITEM_STATUS_META,
  PROGRAM_KIND_META,
  PROGRAM_STATUS_META,
  createProgramDraft,
  isProgramSection,
  nextMatchRound,
  postMatchRounds,
  programBudget,
  programItemStatusMeta,
  programItemTotal,
  programItems,
  programKindMeta,
  programPosts,
  programReadiness,
  programStatusMeta,
  programTasks,
  shouldSyncEditorDraft,
  sortRetreatPrograms,
} from "./programPreparation";
import type { RetreatProgram, RetreatProgramItem } from "./types";

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

describe("shouldSyncEditorDraft", () => {
  const base = { id: "p1", resetVersion: 0 };

  it("편집 중이 아니면 서버 값으로 동기화한다", () => {
    expect(shouldSyncEditorDraft({ dirty: false, previous: base, next: base })).toBe(true);
  });

  it("편집 중에 같은 프로그램이 갱신되면(다른 사람의 저장) 덮지 않는다", () => {
    expect(shouldSyncEditorDraft({ dirty: true, previous: base, next: base })).toBe(false);
  });

  it("사용자가 다른 프로그램으로 옮기면 편집 중이어도 동기화한다", () => {
    expect(shouldSyncEditorDraft({ dirty: true, previous: base, next: { id: "p2", resetVersion: 0 } })).toBe(true);
  });

  it("변경 버리기(resetVersion 증가)는 편집 중이어도 동기화한다", () => {
    expect(shouldSyncEditorDraft({ dirty: true, previous: base, next: { id: "p1", resetVersion: 1 } })).toBe(true);
  });
});

describe("programStatusMeta · programKindMeta", () => {
  it("모르는 값이 와도 기본값으로 읽히고 던지지 않는다", () => {
    // DB를 손으로 고치거나 스키마를 되돌렸을 때 화면 전체가 죽지 않아야 한다.
    expect(programStatusMeta("archived" as never).label).toBe(PROGRAM_STATUS_META.draft.label);
    expect(programKindMeta("workshop" as never)).toBe(PROGRAM_KIND_META.other);
  });
});

describe("하위 목록 · 예산", () => {
  const item = (over: Partial<RetreatProgramItem>): RetreatProgramItem => ({
    id: "", order: 0, name: "물품", status: "todo", createdAt: 1, updatedAt: 1, ...over,
  });

  it("DB가 id를 저장하지 않아도 Firebase 키에서 복원한다", () => {
    // 복원이 빠지면 화면이 undefined 키로 저장·삭제를 시도해 노드를 오염시킨다.
    const program = {
      items: { "-Nabc": { order: 1, name: "당근", status: "purchased", createdAt: 2, updatedAt: 2 } },
    } as unknown as RetreatProgram;
    expect(programItems(program).map((i) => i.id)).toEqual(["-Nabc"]);
  });

  it("order → createdAt → id 순으로 안정 정렬한다", () => {
    const program = {
      posts: {
        b: { order: 2, name: "두번째", createdAt: 1, updatedAt: 1 },
        a: { order: 1, name: "첫번째", createdAt: 9, updatedAt: 9 },
      },
    } as unknown as RetreatProgram;
    expect(programPosts(program).map((p) => p.name)).toEqual(["첫번째", "두번째"]);
  });

  it("금액은 수량 × 단가이고 값이 없으면 0이다", () => {
    expect(programItemTotal({ quantity: 4, unitPrice: 3600 })).toBe(14400);
    expect(programItemTotal({ quantity: undefined, unitPrice: 3000 })).toBe(0);
  });

  it("교회 비품과 제작 예정은 예산에서 빼고, 구매 완료와 예정을 나눠 센다", () => {
    const budget = programBudget([
      item({ status: "purchased", quantity: 4, unitPrice: 3600 }),   // 14400 지출
      item({ status: "todo", quantity: 2, unitPrice: 1000 }),        // 2000 예정
      item({ status: "inChurch", quantity: 5, unitPrice: 9999 }),    // 제외
      item({ status: "toMake", quantity: 5, unitPrice: 9999 }),      // 제외
    ]);
    expect(budget).toEqual({ spent: 14400, planned: 2000, total: 16400, count: 4 });
  });

  it("모르는 물품 상태도 기본값으로 읽히고 예산에 포함된다", () => {
    expect(programItemStatusMeta("unknown" as never).label).toBe(PROGRAM_ITEM_STATUS_META.todo.label);
  });
});

describe("isProgramSection", () => {
  it("정의된 섹션만 통과시킨다", () => {
    expect(isProgramSection("posts")).toBe(true);
    expect(isProgramSection("nope")).toBe(false);
    expect(isProgramSection(null)).toBe(false);
  });
});

describe("대진표", () => {
  const post = (matches: Record<string, unknown>) => ({ id: "p", order: 1, name: "게임", matches, createdAt: 1, updatedAt: 1 }) as never;

  it("라운드별로 묶고 라운드 → 순서 → id 순으로 정렬한다", () => {
    const rounds = postMatchRounds(post({
      m2: { round: 2, order: 1, teamA: "3조", createdAt: 2, updatedAt: 2 },
      m1b: { round: 1, order: 2, teamA: "2조", createdAt: 3, updatedAt: 3 },
      m1a: { round: 1, order: 1, teamA: "1조", createdAt: 4, updatedAt: 4 },
    }));
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].matches.map((m) => m.teamA)).toEqual(["1조", "2조"]);
  });

  it("경기의 id를 Firebase 키에서 복원한다", () => {
    const rounds = postMatchRounds(post({ "-Nxyz": { round: 1, order: 1, createdAt: 1, updatedAt: 1 } }));
    expect(rounds[0].matches[0].id).toBe("-Nxyz");
  });

  it("대진이 없으면 1라운드부터 시작한다", () => {
    expect(nextMatchRound(post({}))).toBe(1);
    expect(nextMatchRound(post({ a: { round: 3, order: 1, createdAt: 1, updatedAt: 1 } }))).toBe(3);
  });
});
