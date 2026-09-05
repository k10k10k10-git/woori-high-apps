import { describe, expect, it, vi } from "vitest";
import {
  PROGRAM_ITEM_STATUS_META,
  PROGRAM_KIND_META,
  PROGRAM_STATUS_META,
  balanceGroupsAcrossCompetitionTeams,
  canPublishProgram,
  commonItems,
  commonRoles,
  createProgramDraft,
  createProgramFromTemplate,
  groupItemsByPost,
  isProgramSection,
  itemsOfPost,
  moveProgramPostOrder,
  nextMatchRound,
  postMatchRounds,
  programBudget,
  programItemStatusMeta,
  programItemTotal,
  programItems,
  programKindMeta,
  programMeetings,
  programPostReadiness,
  programPosts,
  programReadiness,
  programStatusMeta,
  programTaskProgress,
  programTaskDecisionLink,
  programDecisionTaskId,
  programTaskStatus,
  programTasks,
  programSectionFromParam,
  rolesOfPost,
  shouldSyncEditorDraft,
  sortRetreatPrograms,
  meetingDecisions,
} from "./programPreparation";
import { paths } from "./paths";
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

  it("진행 블록을 한 칸씩 옮기고 경계에서는 순서를 유지한다", () => {
    const posts = [
      { id: "b", order: 2, name: "둘", createdAt: 20, updatedAt: 20 },
      { id: "a", order: 1, name: "하나", createdAt: 10, updatedAt: 10 },
      { id: "c", order: 3, name: "셋", createdAt: 30, updatedAt: 30 },
    ];
    expect(moveProgramPostOrder(posts, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveProgramPostOrder(posts, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveProgramPostOrder(posts, "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveProgramPostOrder(posts, "missing", 1)).toEqual(["a", "b", "c"]);
  });

  it("현장 준비에 필요한 10가지 핵심 항목을 점검한다", () => {
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
      ready: 6, total: 10, missingLabels: ["게임 구성", "역할", "물품", "사전 테스트"],
    });

    const filled = programReadiness(base({
      ...body,
      posts: { g1: { order: 1, name: "물코기", rules: "1. 조별 대항", testStatus: "passed", createdAt: 1, updatedAt: 1 } },
      roles: { r1: { order: 1, role: "진행", assignee: "박준규", postId: "g1", createdAt: 1, updatedAt: 1 } },
      items: { i1: { order: 1, name: "줄자", status: "todo", quantity: 2, postId: "g1", createdAt: 1, updatedAt: 1 } },
    } as never));
    expect(filled).toMatchObject({ ready: 10, total: 10, percent: 100, missingLabels: [] });

    // 이름만 있는 게임·담당 없는 역할·수량 없는 물품은 아직 준비된 것으로 세지 않는다.
    const shallow = programReadiness(base({
      ...body,
      posts: { g1: { order: 1, name: "물코기", createdAt: 1, updatedAt: 1 } },
      roles: { r1: { order: 1, role: "진행", postId: "g1", createdAt: 1, updatedAt: 1 } },
      items: { i1: { order: 1, name: "줄자", status: "todo", postId: "g1", createdAt: 1, updatedAt: 1 } },
    } as never));
    expect(shallow.missingLabels).toEqual(["게임 구성", "역할", "물품", "사전 테스트"]);
    expect(shallow.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "게임 구성", section: "posts", targetId: "program-post-rules-g1", ready: false }),
      expect.objectContaining({ label: "역할", section: "posts", targetId: "program-role-assignee-r1", action: "진행 블록에 담당 배치", ready: false }),
      expect.objectContaining({ label: "물품", section: "posts", targetId: "program-item-quantity-i1", ready: false }),
      expect.objectContaining({ label: "브리핑 또는 대본", section: "overview", targetId: "program-briefing", ready: true }),
    ]));
    expect(canPublishProgram(base(body))).toBe(false);
    expect(canPublishProgram(base({
      ...body,
      posts: { g1: { order: 1, name: "물코기", rules: "1. 조별 대항", testStatus: "passed", createdAt: 1, updatedAt: 1 } },
      roles: { r1: { order: 1, role: "진행", assignee: "박준규", postId: "g1", createdAt: 1, updatedAt: 1 } },
      items: { i1: { order: 1, name: "줄자", status: "todo", quantity: 2, postId: "g1", createdAt: 1, updatedAt: 1 } },
    } as never))).toBe(true);
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

describe("실행 중심 준비 흐름", () => {
  it("운영 방식 템플릿은 기존 프로그램 구조 안에 시작 블록만 만든다", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const course = createProgramFromTemplate(3, "course");
    expect(course).toMatchObject({ order: 3, title: "코스 순환 프로그램", kind: "post", status: "draft" });
    expect(programPosts({ id: "course", ...course } as RetreatProgram).map((post) => [post.name, post.operationMode, post.participationMode])).toEqual([
      ["전체 브리핑", "whole", "retreatGroup"],
      ["코스 순환", "course", "retreatGroup"],
      ["복귀·점수 집계", "break", "retreatGroup"],
    ]);
    expect(createProgramFromTemplate(1, "blank")).toEqual(createProgramDraft(1));
    vi.restoreAllMocks();
  });

  it("모든 시작 템플릿은 활동 블록과 사전 테스트 기본값을 안전하게 만든다", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    for (const template of ["host", "course", "group", "alliance"] as const) {
      const draft = createProgramFromTemplate(1, template);
      const posts = programPosts({ id: template, ...draft } as RetreatProgram);
      expect(posts.length).toBeGreaterThan(0);
      expect(posts.every((post) => post.testStatus === "needed" || post.testStatus === "notNeeded")).toBe(true);
    }
    expect(programPosts({ id: "blank", ...createProgramFromTemplate(1, "blank") } as RetreatProgram)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("예전 done 값과 새 상태를 함께 읽고 실행 지표를 분리한다", () => {
    const program = base({
      tasks: {
        old: { title: "기존 완료", done: true, createdAt: 1, updatedAt: 1 },
        doing: { title: "진행", status: "doing", assignee: "성훈", dueDate: "2026-09-04", createdAt: 2, updatedAt: 2 },
        blocked: { title: "막힘", status: "blocked", dueDate: "2026-09-01", createdAt: 3, updatedAt: 3 },
      },
    } as never);
    expect(programTaskStatus(programTasks(program)[0])).toBe("done");
    expect(programTaskStatus({ title: "손상된 상태", status: "unknown" as never, createdAt: 0, updatedAt: 0 } as never)).toBe("todo");
    expect(programTaskProgress(program, "2026-09-02")).toMatchObject({
      total: 3, done: 1, doing: 1, blocked: 1, overdue: 1, unassigned: 1, percent: 33,
    });
  });

  it("기한 초과는 브라우저 UTC가 아니라 서울 날짜를 기준으로 센다", () => {
    vi.useFakeTimers();
    try {
      // UTC로는 9/4이지만 서울은 이미 9/5이다.
      vi.setSystemTime(new Date("2026-09-04T16:30:00.000Z"));
      const program = base({
        tasks: {
          dueYesterday: { title: "어제 할 일", done: false, dueDate: "2026-09-04", createdAt: 1, updatedAt: 1 },
          dueToday: { title: "오늘 할 일", done: false, dueDate: "2026-09-05", createdAt: 2, updatedAt: 2 },
        },
      } as never);
      expect(programTaskProgress(program).overdue).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("진행 블록 준비 판정은 물품 수량·테스트·막힘을 한 기준으로 계산한다", () => {
    const post = {
      id: "game", order: 1, name: "협력 게임", rules: "규칙", testStatus: "passed", createdAt: 1, updatedAt: 1,
    } as const;
    const roles = [{ id: "role", order: 1, role: "진행", assignee: "성훈", postId: "game", createdAt: 1, updatedAt: 1 }];
    const zeroQuantity = [{ id: "item", order: 1, name: "공", status: "todo" as const, quantity: 0, postId: "game", createdAt: 1, updatedAt: 1 }];
    expect(programPostReadiness(post, zeroQuantity, roles)).toMatchObject({ itemsReady: false, ready: false });
    expect(programPostReadiness(post, [{ ...zeroQuantity[0], quantity: 1 }], roles)).toMatchObject({ itemsReady: true, ready: true });
    expect(programPostReadiness(post, [{ ...zeroQuantity[0], quantity: 1 }], [
      ...roles,
      { id: "unassigned", order: 2, role: "안전", postId: "game", createdAt: 2, updatedAt: 2 },
    ])).toMatchObject({ rolesReady: false, ready: false });
    expect(programPostReadiness({ ...post, blocker: "장소 미확정" }, [{ ...zeroQuantity[0], quantity: 1 }], roles)).toMatchObject({ blocked: true, ready: false });

    const breakPost = { ...post, operationMode: "break" as const, testStatus: "notNeeded" as const };
    expect(programPostReadiness(breakPost, [], roles)).toMatchObject({ itemsReady: true, testReady: true, ready: true });
  });

  it("현장 준비율과 실행 할 일 완료를 분리하되 둘 다 끝나야 공유한다", () => {
    const complete = base({
      date: "2026-09-05",
      startTime: "14:00",
      place: "본당",
      lead: "성훈",
      objective: "함께 협력한다.",
      flow: "오프닝, 활동, 마무리",
      briefing: "교사 브리핑",
      posts: {
        activity: { order: 1, name: "메인 활동", rules: "활동 규칙", testStatus: "passed", createdAt: 1, updatedAt: 1 },
        transition: { order: 2, name: "이동", operationMode: "break", concept: "다음 장소로 이동", testStatus: "notNeeded", createdAt: 2, updatedAt: 2 },
      },
      roles: {
        r1: { order: 1, role: "진행", assignee: "진행자", postId: "activity", createdAt: 1, updatedAt: 1 },
        r2: { order: 2, role: "안내", assignee: "안내자", postId: "transition", createdAt: 2, updatedAt: 2 },
      },
      items: {
        i1: { order: 1, name: "공", status: "todo", quantity: 1, postId: "activity", createdAt: 1, updatedAt: 1 },
      },
    } as never);
    expect(programReadiness(complete)).toMatchObject({ percent: 100, missingLabels: [] });
    expect(canPublishProgram(complete)).toBe(true);

    const withTask = base({ ...complete, tasks: {
      task: { title: "진행표 인쇄", done: false, status: "doing", createdAt: 1, updatedAt: 1 },
    } } as never);
    expect(programReadiness(withTask).percent).toBe(100);
    expect(canPublishProgram(withTask)).toBe(false);
    expect(canPublishProgram(base({ ...complete, posts: {
      ...complete.posts,
      activity: { ...complete.posts?.activity, blocker: "음향 확인 필요" },
    } } as never))).toBe(false);
  });

  it("회의와 결정은 Firebase 키를 id로 복구하고 최근 회의부터 보여준다", () => {
    const program = base({
      meetings: {
        first: { title: "첫 회의", date: "2026-08-20", closed: true, createdAt: 1, updatedAt: 1 },
        latest: {
          title: "최근 회의", date: "2026-08-30", closed: false, createdAt: 2, updatedAt: 2,
          decisions: {
            d2: { title: "두 번째", status: "decided", createdAt: 4, updatedAt: 4 },
            d1: { title: "첫 번째", status: "discussing", createdAt: 3, updatedAt: 3 },
          },
        },
      },
    } as never);
    const meetings = programMeetings(program);
    expect(meetings.map((meeting) => meeting.id)).toEqual(["latest", "first"]);
    expect(meetingDecisions(meetings[0]).map((decision) => decision.id)).toEqual(["d1", "d2"]);
  });

  it("회의 결정의 할 일 연결은 재시도해도 같은 ID로 수렴하고 구버전 연결도 찾는다", () => {
    expect(programDecisionTaskId("meeting-a", "decision-a")).toBe("decision-meeting-a-decision-a");
    expect(programDecisionTaskId("meeting-a", "decision-a")).toBe(programDecisionTaskId("meeting-a", "decision-a"));

    const directTask = { id: "direct", title: "직접 연결", done: false, sourceMeetingId: "m1", sourceDecisionId: "d1", createdAt: 1, updatedAt: 1 };
    expect(programTaskDecisionLink(base(), directTask)).toEqual({ meetingId: "m1", decisionId: "d1" });

    const legacy = base({ meetings: {
      m2: { title: "회의", date: "2026-09-05", decisions: {
        d2: { title: "결정", status: "decided", taskId: "legacy-task", createdAt: 1, updatedAt: 1 },
      }, createdAt: 1, updatedAt: 1 },
    } } as never);
    expect(programTaskDecisionLink(legacy, { id: "legacy-task", title: "이전 연결", done: false, createdAt: 1, updatedAt: 1 })).toEqual({ meetingId: "m2", decisionId: "d2" });
  });

  it("회의 원문은 공개 프로그램이 아니라 관리자 전용 경로를 사용한다", () => {
    expect(paths.programs("retreat-a")).toBe("retreats/retreat-a/programs");
    expect(paths.programMeetings("retreat-a", "program-a")).toBe("retreatsPrivate/retreat-a/programMeetings/program-a");
    expect(paths.programDecision("retreat-a", "program-a", "meeting-a", "decision-a"))
      .toBe("retreatsPrivate/retreat-a/programMeetings/program-a/meeting-a/decisions/decision-a");
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

  it("예전 진행안·물품 링크를 새 작업 흐름으로 연결한다", () => {
    expect(programSectionFromParam("flow")).toBe("posts");
    expect(programSectionFromParam("items")).toBe("roles");
    expect(programSectionFromParam("unknown")).toBe("overview");
  });
});

describe("연합팀 자동 편성", () => {
  it("기본 조를 쪼개지 않고 학생 수가 적은 팀부터 채운다", () => {
    const teams = [
      { id: "blue", order: 1, name: "파랑", createdAt: 1, updatedAt: 1 },
      { id: "red", order: 2, name: "빨강", createdAt: 1, updatedAt: 1 },
    ];
    const groups = [
      { id: "g1", name: "1조", bu: "1부", teachers: [], leader: "", studentIds: ["1", "2", "3", "4"] },
      { id: "g2", name: "2조", bu: "1부", teachers: [], leader: "", studentIds: ["5", "6", "7"] },
      { id: "g3", name: "3조", bu: "1부", teachers: [], leader: "", studentIds: ["8", "9"] },
    ];

    expect(balanceGroupsAcrossCompetitionTeams(groups, teams)).toEqual({ g1: "blue", g2: "red", g3: "red" });
  });

  it("연합팀이 없으면 빈 배치를 반환한다", () => {
    expect(balanceGroupsAcrossCompetitionTeams([], [])).toEqual({});
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

  it("준비율은 일부 블록만 채운 상태를 완료로 세지 않는다", () => {
    const readiness = programReadiness(program);
    expect(readiness.missingLabels).toEqual(expect.arrayContaining(["게임 구성", "역할", "물품", "사전 테스트"]));
    expect(readiness.total).toBe(10);
  });
});
