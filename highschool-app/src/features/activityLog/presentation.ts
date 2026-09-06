import { ACTIVITY_AREAS, type ActivityAction, type ActivityChange, type ActivityLogRecord } from "./types";

export interface ActivityChangePresentation {
  title: string;
  fields: string[];
  before?: string | null;
  after?: string | null;
  redacted: boolean;
  description?: string;
}

export interface ActivityLogPresentation {
  areaLabel: string;
  targetLabel: string;
  contextLabel?: string;
  summary: string;
  countLabel: string;
  changes: ActivityChangePresentation[];
  searchText: string;
}

const TARGET_LABELS = [
  "새친구 비공개 정보", "새친구 출석부 연결", "수련회 참가자", "참가자 연락처", "교사 비공개 정보",
  "신청 비공개 정보", "사역팀 출석", "훈련 출석", "수련회 설정", "수련회 참가자", "교사·스탭",
  "학기 기록", "학기 신청", "학기 회차", "학기 자료", "학기 설정", "일정·사역 준비", "계정·권한",
  "새친구", "사역팀", "훈련 반", "수료 확인", "커리큘럼", "프로그램", "준비회의", "사이트 요청",
  "접근 요청", "기획 메모", "현장 일정", "현장 큐", "현장 포스트", "이동 동선", "현장 인원체크",
  "자리 배치", "조 스탭", "GBS 장소", "숙소 배치도", "큐시트", "현장 안내", "현장 접근 설정",
  "조 편성", "숙소 배정", "차량", "준비물", "행정 물품", "간식", "명단 표시", "부분 참석",
  "현장 접수", "단체티", "수련회 기간", "취소·환불", "입금 확인", "의료 기록", "버스", "식사 배정",
] as const;

const ROLE_LABELS: Readonly<Record<string, string>> = {
  manager: "운영 관리자",
  editor: "편집 담당자",
  groupStaff: "조 담당자",
  member: "일반 팀원",
  observer: "조회 담당자",
};

const ACTION_VERBS: Record<ActivityAction, string> = { create: "추가", update: "저장", delete: "삭제" };
const HASHED_ID = /^id_[a-f0-9]{8,}$/i;
const LONG_ID = /^[A-Za-z0-9_-]{20,}$/;

function isTechnicalIdentifier(value: string): boolean {
  return HASHED_ID.test(value) || LONG_ID.test(value) || /^[A-Za-z]+\d+[A-Za-z0-9_-]*$/.test(value);
}

function removeTechnicalIdentifiers(value: string): string {
  return value
    .split(/\s+/)
    .filter(token => !HASHED_ID.test(token) && !LONG_ID.test(token))
    .join(" ")
    .replace(/\s+([·,])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function targetTitle(value: string): string {
  const clean = removeTechnicalIdentifiers(value);
  if (!clean || clean.includes("/")) return "업무 기록";
  if (clean === "새친구") return "새친구 기본 정보";
  if (clean === "새친구 비공개 정보") return "새친구 연락처·개인 정보";
  if (clean === "신청 비공개 정보") return "학기 신청 연락처·개인 정보";
  if (clean === "참가자 연락처") return "수련회 참가자 연락처";
  return clean;
}

function knownTargetHead(value: string, legacyBulk: boolean): string | null {
  for (const label of TARGET_LABELS) {
    if (value === label) return targetTitle(label);
    // 구 writer의 복수 대상 필드는 반드시 `업무명 식별자 · 필드명` 형식이었다.
    // 실제 짧은 키(p_0, 1_student, friend-a)도 사람이 읽을 정보가 아니므로 형식과 무관하게 접미사를 버린다.
    if (legacyBulk && value.startsWith(`${label} `)) return targetTitle(label);
  }
  return null;
}

function humanizeContextPart(value: string): string | null {
  const semester = /^(\d{4})-([12])$/.exec(value);
  if (semester) return `${semester[1]}년 ${semester[2]}학기`;
  const sunday = /^(\d{4})-sunday$/i.exec(value);
  if (sunday) return `${sunday[1]}년 주일 운영`;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return `${date[1]}. ${date[2]}. ${date[3]}.`;
  if (isTechnicalIdentifier(value)) return null;
  const clean = removeTechnicalIdentifiers(value);
  if (!clean || (!/[가-힣]/.test(clean) && /^[A-Za-z0-9_-]+$/.test(clean))) return null;
  return clean;
}

export function humanizeActivityContext(context?: string): string | undefined {
  if (!context) return undefined;
  const parts = context.split(/\s+·\s+/).map(part => humanizeContextPart(part.trim())).filter((part): part is string => Boolean(part));
  return parts.length ? [...new Set(parts)].join(" · ") : undefined;
}

function mapValue(field: string, value: string | null | undefined): string | null | undefined {
  if (typeof value !== "string") return value;
  if (field === "찬양팀 권한") return Object.hasOwn(ROLE_LABELS, value) ? ROLE_LABELS[value] : value;
  if (["출결", "출석", "출석 상태", "저장된 출석 상태"].includes(field)) {
    if (value === "PRESENT") return "출석";
    if (value === "ABSENT") return "결석";
    if (value === "LATE") return "지각";
  }
  return value;
}

function redactedDescription(action: ActivityAction): string {
  return action === "delete"
    ? "삭제 전 값은 활동 로그에 기록하지 않았습니다."
    : "세부 값은 활동 로그에 기록하지 않았습니다.";
}

function presentChange(change: ActivityChange, action: ActivityAction): ActivityChangePresentation {
  const sections = change.field.split(/\s+·\s+/, 2).map(value => value.trim());
  const knownTitle = knownTargetHead(sections[0], sections.length > 1);
  const title = knownTitle ?? targetTitle(sections[0]);
  const fields = sections.length > 1
    ? sections[1].split("·").map(value => targetTitle(value.trim())).filter(Boolean)
    : [];
  if (change.redacted) {
    return { title, fields, redacted: true, description: redactedDescription(action) };
  }
  return {
    title,
    fields,
    before: mapValue(title, change.before),
    after: mapValue(title, change.after),
    redacted: false,
  };
}

function summaryOf(changes: ActivityChangePresentation[], targetLabel: string, action: ActivityAction): string {
  if (changes.length === 1 && !changes[0].redacted) {
    const change = changes[0];
    const before = change.before === null ? "값 없음" : change.before;
    const after = change.after === null ? "값 없음" : change.after;
    if (before !== undefined && after !== undefined && before !== after) return `${change.title} · ${before} → ${after}`;
    if (after !== undefined) return `${change.title} · ${after} ${ACTION_VERBS[action]}`;
    if (before !== undefined) return `${change.title} · 저장 후 값 미기록`;
  }
  const fields = [...new Set(changes.flatMap(change => change.fields.length ? change.fields : [change.title]).filter(field => field !== "업무 기록"))];
  if (!fields.length) return `${targetLabel} ${ACTION_VERBS[action]}`;
  const visible = fields.slice(0, 3).join(" · ");
  const omitted = fields.length - 3;
  return `${visible}${omitted > 0 ? ` 외 ${omitted}개 항목` : ""} ${ACTION_VERBS[action]}`;
}

export function presentActivityLog(record: ActivityLogRecord): ActivityLogPresentation {
  const praise = record.target.path === "praiseOps" || record.target.path.startsWith("praiseOps/");
  const areaLabel = praise ? "찬양팀 운영" : ACTIVITY_AREAS[record.area];
  const bulkTarget = /^(.*?) 외 \d+개 대상$/.exec(removeTechnicalIdentifiers(record.target.label));
  const bulkBase = bulkTarget ? targetTitle(bulkTarget[1].trim()) : null;
  const targetLabel = bulkBase
    ? `${bulkBase === "새친구 기본 정보" ? "새친구" : bulkBase} 관련 기록`
    : targetTitle(record.target.label);
  const rawContext = humanizeActivityContext(record.target.context);
  const contextLabel = bulkTarget && rawContext
    ? rawContext.split(/\s+·\s+/).filter(part => !/^\d+개 대상$/.test(part)).join(" · ") || undefined
    : rawContext;
  const changes = record.changes.map(change => presentChange(change, record.action));
  const summary = summaryOf(changes, targetLabel, record.action);
  const countUnit = /(?:^|·)\s*\d+개 대상(?:\s*·|$)/.test(record.target.context ?? "") || /개 대상/.test(record.target.label) ? "대상" : "항목";
  const countLabel = countUnit === "대상"
    ? `${record.changedCount.toLocaleString("ko-KR")}건`
    : `${record.changedCount.toLocaleString("ko-KR")}개 항목`;
  const searchText = [
    areaLabel,
    targetLabel,
    contextLabel,
    summary,
    ACTION_VERBS[record.action],
    ...changes.flatMap(change => [change.title, ...change.fields, change.before, change.after]),
  ].filter(Boolean).join(" ");
  return { areaLabel, targetLabel, ...(contextLabel ? { contextLabel } : {}), summary, countLabel, changes, searchText };
}
