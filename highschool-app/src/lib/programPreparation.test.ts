import { describe, expect, it, vi } from "vitest";
import {
  PROGRAM_ITEM_STATUS_META,
  PROGRAM_KIND_META,
  PROGRAM_STATUS_META,
  commonItems,
  commonRoles,
  createProgramDraft,
  groupItemsByPost,
  isProgramSection,
  itemsOfPost,
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
  rolesOfPost,
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

  it("현장 준비에 필요한 8가지 핵심 항목을 점검한다", () => {
    // 본문만 채운 상태 — 게임·역할·물품이 비어 있으면 아직 100%가 아니다.
    const body = {
      date: "2026-08-08",
      startTime: "14:00",
      place: "본당",
      lead: "김성훈",
      objective: "서로 협력한다.",
      flow: "오프닝\n본 활동\n마무리",
      rules: "안전 수칙을 지킨니다.",
      briefing: "교사 역할을 안내합니다.",
    };
    expect(programReadiness(base(body))).toMatchObject({
      ready: 5, total: 8, missingLabels: ["게임·포스트", "역할", "물품"],
    });

    const filled = programReadiness(base({
      ...body,
      posts: { g1: { order: 1, name: "물코기", rules: "1. 조별 대항", createdAt: 1, updatedAt: 1 } },
      roles: { r1: { order: 1, role: "진행", assignee: "박준규", createdAt: 1, updatedAt: 1 } },
      items: { i1: { order: 1, name: "줄자", status: "todo", quantity: 2, createdAt: 1, updatedAt: 1 } },
    } as never));
    expect(filled).toMatchObject({ ready: 8, total: 8, percent: 100, missingLabels: [] });

    // 이름만 있는 게임·담당 없는 역할·수량 없는 물품은 아직 준비된 것으로 세지 않는다.
    const shallow = programReadiness(base({
      ...body,
      posts: { g1: { order: 1, name: "물코기", createdAt: 1, updatedAt: 1 } },
      roles: { r1: { order: 1, role: "진행", createdAt: 1, updatedAt: 1 } },
      items: { i1: { order: 1, name: "줄자", status: "todo", createdAt: 1, updatedAt: 1 } },
    } as never));
    expect(shallow.missingLabels).toEqual(["게임·포스트", "역할", "물품"]);
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

describe("게임 ↔ 물품·역할 연결", () => {
  const program = {
    posts: {
      g1: { order: 1, name: "물코기", rules: "1. 조별 대항", createdAt: 1, updatedAt: 1 },
      g2: { order: 2, name: "김밥 코드", createdAt: 2, updatedAt: 2 },
    },
    items: {
      i1: { order: 1, name: "줄자", status: "todo", postId: "g1", quantity: 1, createdAt: 1, updatedAt: 1 },
      i2: { order: 2, name: "종이", status: "purchased", postId: "g1", quantity: 2, unitPrice: 500, createdAt: 2, updatedAt: 2 },
      i3: { order: 3, name: "현수막", status: "todo", createdAt: 3, updatedAt: 3 },
      i4: { order: 4, name: "지워진 게임 물품", status: "todo", postId: "없어진게임", createdAt: 4, updatedAt: 4 },
    },
    roles: {
      r1: { order: 1, role: "진행", assignee: "박준규", postId: "g1", createdAt: 1, updatedAt: 1 },
      r2: { order: 2, role: "총괄", createdAt: 2, updatedAt: 2 },
    },
  } as unknown as RetreatProgram;

  it("게임에 묶인 물품·역할만 그 게임에서 보인다", () => {
    expect(itemsOfPost(program, "g1").map((i) => i.name)).toEqual(["줄자", "종이"]);
    expect(itemsOfPost(program, "g2")).toEqual([]);
    expect(rolesOfPost(program, "g1").map((r) => r.role)).toEqual(["진행"]);
  });

  it("게임이 없거나 삭제된 게임에 묶인 항목은 공통으로 모인다", () => {
    // postId 도입 이전 데이터와, 게임을 지운 뒤 남은 물품이 사라지지 않아야 한다.
    expect(commonItems(program).map((i) => i.name)).toEqual(["현수막", "지워진 게임 물품"]);
    expect(commonRoles(program).map((r) => r.role)).toEqual(["총괄"]);
  });

  it("게임 순서대로 묶고 공통을 마지막에 둔다", () => {
    const groups = groupItemsByPost(program);
    expect(groups.map((g) => g.label)).toEqual(["물코기", "김밥 코드", "프로그램 공통"]);
    // 비어 있는 게임도 자리를 남겨 어디가 비었는지 보이게 한다.
    expect(groups[1].entries).toEqual([]);
  });

  it("준비율이 게임·역할·물품도 센다", () => {
    // 본문만 보던 시절에는 게임을 아무리 채워도 0%였다.
    const readiness = programReadiness(program);
    expect(readiness.readyLabels).toEqual(expect.arrayContaining(["게임·포스트", "역할", "물품"]));
    expect(readiness.total).toBe(8);
  });
});
