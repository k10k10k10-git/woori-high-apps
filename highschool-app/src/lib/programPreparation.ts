import type { RetreatProgram, RetreatProgramKind, RetreatProgramStatus } from "./types";

export const PROGRAM_STATUS_META: Record<RetreatProgramStatus, { label: string; description: string }> = {
  draft: { label: "초안", description: "내용을 작성하는 중입니다." },
  review: { label: "검토 중", description: "담당자가 내용을 확인하고 있습니다." },
  confirmed: { label: "확정", description: "준비 내용이 확정됐지만 현장에는 공유하지 않습니다." },
  published: { label: "현장 공유", description: "이가드 정보 화면에 공유됩니다." },
};

export const PROGRAM_KIND_META: Record<RetreatProgramKind, string> = {
  main: "집중형",
  post: "포스트·코스형",
  sports: "운동회·대진형",
  other: "기타",
};

export function createProgramDraft(order: number, title = `프로그램 ${order}`): Omit<RetreatProgram, "id"> {
  const now = Date.now();
  return {
    order,
    title,
    kind: "main",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

export function sortRetreatPrograms(programs: RetreatProgram[]): RetreatProgram[] {
  return [...programs].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

const CHECKS: Array<{ key: string; ready: (program: RetreatProgram) => boolean }> = [
  { key: "일정·장소", ready: (program) => Boolean(program.date && program.startTime && program.place?.trim()) },
  { key: "담당", ready: (program) => Boolean(program.lead?.trim()) },
  { key: "목표", ready: (program) => Boolean(program.objective?.trim()) },
  { key: "진행안", ready: (program) => Boolean(program.flow?.trim()) },
  { key: "규칙", ready: (program) => Boolean(program.rules?.trim()) },
  { key: "브리핑·대본", ready: (program) => Boolean(program.briefing?.trim() || program.script?.trim()) },
];

export function programReadiness(program: RetreatProgram) {
  const readyLabels = CHECKS.filter((check) => check.ready(program)).map((check) => check.key);
  const missingLabels = CHECKS.filter((check) => !check.ready(program)).map((check) => check.key);
  return {
    ready: readyLabels.length,
    total: CHECKS.length,
    percent: Math.round((readyLabels.length / CHECKS.length) * 100),
    readyLabels,
    missingLabels,
  };
}

export function programTasks(program: RetreatProgram) {
  return Object.entries(program.tasks ?? {})
    .map(([id, task]) => ({ ...task, id: task.id || id }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
