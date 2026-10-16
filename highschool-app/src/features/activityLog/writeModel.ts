import type { ActivityAction, ActivityArea, ActivityChange, ActivityLogRecord } from "./types";

export type RootWritePatch = Record<string, unknown>;
export type ActivityWriteSummary = Pick<ActivityLogRecord, "area" | "action" | "target" | "changes" | "changedCount">;
/** 화면에서 이미 읽은 표시용 참고 정보이며 서버가 검증한 대상 신원은 아니다. */
export type ActivityWriteContext = { subjectName?: string; date?: string };

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "이름", title: "제목", school: "학교", grade: "학년", class: "반", part: "부서", bu: "부서", gender: "성별",
  owner: "담당", teamId: "사역팀 배정", trainingClassId: "훈련 반 배정", status: "상태", order: "순서", color: "색상",
  s: "출석 상태", by: "작성자 표기", at: "입력 시각", date: "날짜", startDate: "시작일", endDate: "종료일", type: "구분",
  createdAt: "생성 시각", updatedAt: "수정 시각", createdBy: "생성자 표기", updatedBy: "수정자 표기",
  decision: "등록 결정", week1Date: "1주차", week2Date: "2주차", registeredDate: "접수일", assignedClassKey: "반 배정", rosterSync: "출석부 반영",
  phone: "본인 연락처", parentPhone: "보호자 연락처", birth: "생년월일", address: "주소", email: "이메일",
  teamMemo: "팀 메모", familyNotes: "가족 메모", pastoralNotes: "심방 메모", churchFriend: "교회 지인", inviter: "인도자", faithStep: "신급",
  note: "메모", notes: "메모", memo: "메모", description: "설명", content: "본문", body: "본문", extra: "특이사항", reason: "사유",
  tasks: "세부 할 일", meetings: "준비회의", decisions: "회의 결정", posts: "포스트", items: "준비물", roles: "역할", competitionTeams: "경기팀",
  members: "명단", groupIds: "조 배정", studentIds: "학생 배정", teacherIds: "교사 배정", checked: "확인 상태",
  completed: "완료 상태", certPrinted: "수료증 확인", photoChecked: "사진 확인", completionRule: "수료 기준",
  deletionPending: "자료 삭제 진행",
  role: "권한", semesterRole: "학기 권한", retreatRole: "수련회 권한", sundayWrite: "주일 편집 권한", requestedAt: "요청 시각",
  teamKey: "연결 팀", teamMemberships: "팀별 권한", active: "사용 상태", semesters: "적용 학기",
  attachment: "첨부", resolutionNote: "처리 메모", resolvedAt: "처리 시각", resolvedBy: "처리자 표기", notifiedAt: "알림 확인",
  studentId: "학생 연결", participantKey: "참가자 연결", sourceSite: "업무 구분", isOnSite: "현장 등록 구분", paid: "입금 상태",
};
const SEMESTER_LABELS: Readonly<Record<string, string>> = {
  teams: "사역팀", trainingClasses: "훈련 반", sessions: "학기 회차", applications: "학기 신청", applicationsPrivate: "신청 비공개 정보",
  completion: "수료 확인", archiveLinks: "학기 자료", meta: "학기 설정", curriculum: "커리큘럼", newFriends: "새친구", newFriendsPrivate: "새친구 비공개 정보",
};
const RETREAT_LABELS: Readonly<Record<string, string>> = {
  participants: "수련회 참가자", participantContacts: "참가자 연락처", teachers: "교사·스탭", groups: "조 편성", rooms: "숙소 배정",
  carpools: "차량", supplies: "준비물", adminSupplies: "행정 물품", snacks: "간식", cellColors: "명단 표시", partialAttendances: "부분 참석",
  onSiteReg: "현장 접수", tshirtOrders: "단체티", periods: "수련회 기간", cancellations: "취소·환불", unmatchedPayments: "입금 확인",
  medicalLogs: "의료 기록", teacherIdNumbers: "교사 비공개 정보", programs: "프로그램", programMeetings: "준비회의",
};
const FIELD_LABEL_BY_COLLECTION: Readonly<Record<string, string>> = {
  schedule: "현장 일정", segments: "현장 큐", posts: "현장 포스트", movements: "이동 동선", buses: "버스", meals: "식사 배정",
  attendance: "현장 인원체크", seating: "자리 배치", groupStaff: "조 스탭", gbs: "GBS 장소", lodgingMaps: "숙소 배치도",
  cueSheet: "큐시트", guide: "현장 안내", accessLock: "현장 접근 설정",
};
const ACCOUNT_ROOTS = new Set(["admins", "retreatAdmins", "iguardMembers", "iguardRoles"]);
const BACKUP_COLLECTIONS = new Set(["participantsBackups", "participantContactsBackups", "groupsBackups", "roomsBackups", "newFriendRosterBackups", "syncDuplicates"]);
const ownLabel = (map: Readonly<Record<string, string>>, key: string, fallback: string) => Object.hasOwn(map, key) ? map[key] : fallback;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const knownStatus = (value: unknown): value is string => typeof value === "string" && ["출석", "지각", "결석"].includes(value);

/** 경로를 재해석해 원장 값을 다른 곳에 쓰지 않도록 비정상/교차 경로는 사전에 거부한다. */
export function validateWritePath(path: string): string[] {
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("//")) throw new Error("저장 경로가 올바르지 않습니다.");
  const parts = path.split("/");
  if (parts.some((part) => /[.#$\[\]\u0000-\u001f\u007f]/.test(part))) throw new Error("저장 경로가 올바르지 않습니다.");
  if (parts[0] === "activityLogs") throw new Error("활동 로그를 업무 저장 대상으로 사용할 수 없습니다.");
  return parts;
}

export function rootPatchForUpdate(basePath: string, values: unknown): RootWritePatch {
  if (!isObject(values)) throw new Error("저장할 변경값이 올바르지 않습니다.");
  const entries = Object.entries(values).map(([path, value]) => {
    const fullPath = basePath ? `${basePath}/${path}` : path;
    validateWritePath(fullPath);
    return [fullPath, value] as const;
  });
  const paths = new Set(entries.map(([path]) => path));
  for (const path of paths) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      if (paths.has(parts.slice(0, depth).join("/"))) throw new Error("상위 경로와 하위 경로를 같은 저장에 섞을 수 없습니다.");
    }
  }
  return Object.fromEntries(entries);
}

async function safeIdentifier(value: string): Promise<string> {
  if (/^[A-Za-z0-9_-]{1,80}$/.test(value) && !/\d{7,}/.test(value) && !/(?:^|[^\d])01[016789]-?\d{3,4}-?\d{4}(?:$|[^\d])/.test(value)) return value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return "id_" + Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type TargetDescriptor = { area: ActivityArea; label: string; parts: string[]; depth: number; attendance?: boolean; fieldNames: Set<string>; savedStatus?: string };

function describePath(parts: string[]): Omit<TargetDescriptor, "fieldNames" | "savedStatus"> {
  const [root, , collection, subgroup] = parts;
  if (root === "semesters" || root === "semestersPrivate") {
    if (collection === "attendance") return { area: "attendance", label: subgroup === "training" ? "훈련 출석" : "사역팀 출석", parts, depth: Math.min(parts.length, 6), attendance: parts.length >= 6 };
    return { area: collection?.startsWith("newFriends") ? "newFriends" : "semester", label: ownLabel(SEMESTER_LABELS, collection ?? "", "학기 기록"), parts,
      depth: Math.min(parts.length, collection === "meta" ? 3 : collection === "curriculum" ? 5 : 4) };
  }
  if (root === "retreats" || root === "retreatsPrivate") {
    if (collection === "iguard") return { area: "field", label: ownLabel(FIELD_LABEL_BY_COLLECTION, subgroup ?? "", "현장 기록"), parts, depth: Math.min(parts.length, ["guide", "cueSheet", "accessLock"].includes(subgroup) ? 4 : 5) };
    const area = ["programs", "programMeetings"].includes(collection) ? "programs" : "retreat";
    return { area, label: ownLabel(RETREAT_LABELS, collection ?? "", "수련회 설정"), parts,
      depth: Math.min(parts.length, Object.hasOwn(RETREAT_LABELS, collection ?? "") ? collection === "programMeetings" ? 5 : 4 : 3) };
  }
  if (ACCOUNT_ROOTS.has(root)) return { area: "accounts", label: "계정·권한", parts, depth: Math.min(parts.length, 2) };
  if (root === "iguardPending" || root === "retreatPending") return { area: "requests", label: collection === "siteRequests" ? "사이트 요청" : "접근 요청", parts, depth: Math.min(parts.length, collection === "siteRequests" ? 4 : 2) };
  if (root === "prepMilestones" || root === "brainstorm") return { area: "schedule", label: root === "brainstorm" ? "기획 메모" : "일정·사역 준비", parts, depth: Math.min(parts.length, 2) };
  // 통합 앱의 새친구 원자 반영·검증된 되돌리기에 이미 포함된 학생 앱 경로만 식별한다.
  if (root === "classes" || root === "attendance" || root === "trash") return { area: "newFriends", label: "새친구 출석부 연결", parts, depth: Math.min(parts.length, root === "classes" ? 5 : 4) };
  throw new Error("활동 기록을 지원하지 않는 저장 경로입니다.");
}

function isHousekeeping(parts: string[]) {
  if (BACKUP_COLLECTIONS.has(parts[2])) return true;
  return parts[0] === "iguardPending" && parts[2] === "siteRequests" && parts.length === 5 && parts[4] === "notifiedAt";
}

function recordFields(target: TargetDescriptor, parts: string[], value: unknown) {
  const field = parts[target.depth];
  if (field) target.fieldNames.add(ownLabel(FIELD_LABELS, field, "기타 항목"));
  else if (isObject(value)) {
    for (const key of Object.keys(value)) target.fieldNames.add(ownLabel(FIELD_LABELS, key, "기타 항목"));
    if (Object.keys(value).length === 0) target.fieldNames.add("기록 값");
  } else target.fieldNames.add(value === null ? "기록 삭제" : "기록 값");
  if (target.attendance) {
    const status = field === "s" ? value : !field && isObject(value) && Object.hasOwn(value, "s") ? value.s : undefined;
    if (knownStatus(status)) target.savedStatus = status;
  }
}

/** 호출한 쓰기 경로와 제출 필드만 요약한다. 이전 상태/실제 변경 여부를 추측하지 않는다. */
export async function summarizeWrite(
  patch: RootWritePatch,
  requestedAction: ActivityAction,
  options?: { actorUid?: string; context?: ActivityWriteContext },
): Promise<ActivityWriteSummary | null> {
  const targets = new Map<string, TargetDescriptor>();
  for (const [path, value] of Object.entries(patch)) {
    const parts = validateWritePath(path);
    if (isHousekeeping(parts)) continue;
    const descriptor = describePath(parts);
    const key = parts.slice(0, descriptor.depth).join("/");
    const target = targets.get(key) ?? { ...descriptor, fieldNames: new Set<string>() };
    recordFields(target, parts, value);
    targets.set(key, target);
  }
  if (!targets.size) return null;
  const selected = [...targets.values()].slice(0, 30);
  const safeTargets = await Promise.all(selected.map(async (target) => ({ target, parts: await Promise.all(target.parts.slice(0, target.depth).map((part, index) => {
    // 자기 접근 요청은 Rules가 서명된 UID와 경로를 대조한다. 그 UID만 원문을 보존한다.
    if (index === 1 && ["iguardPending", "retreatPending"].includes(target.parts[0]) && part === options?.actorUid) return part;
    return safeIdentifier(part);
  })) })));
  const first = safeTargets[0];
  const bulk = targets.size > 1;
  const changes: ActivityChange[] = [];
  if (bulk) {
    for (const { target } of safeTargets) {
      const label = target.label;
      if (target.savedStatus) changes.push({ field: `${label} · 저장된 출석 상태`.slice(0, 160), after: target.savedStatus });
      else changes.push({ field: `${label} · ${[...target.fieldNames].slice(0, 3).join("·") || "기록"}`.slice(0, 160), redacted: true });
    }
  } else {
    if (first.target.savedStatus) changes.push({ field: "저장된 출석 상태", after: first.target.savedStatus });
    for (const field of first.target.fieldNames) {
      if (field === "출석 상태" && first.target.savedStatus) continue;
      if (changes.length >= 30) break;
      changes.push({ field, redacted: true });
    }
  }
  let context = first.parts[1] ?? "";
  const suppliedName = options?.context?.subjectName;
  const subjectName = typeof suppliedName === "string" && /^[가-힣A-Za-z][가-힣A-Za-z ·'-]{0,39}$/.test(suppliedName) ? suppliedName.trim() : undefined;
  const suppliedDate = options?.context?.date;
  const date = typeof suppliedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate)
    && Number.isFinite(Date.parse(suppliedDate)) && new Date(suppliedDate).toISOString().slice(0, 10) === suppliedDate ? suppliedDate : undefined;
  let href: string | undefined;
  const root = first.target.parts[0];
  const originalId = first.target.parts[1];
  const safeId = first.parts[1];
  if (first.target.area === "newFriends") href = "/sunday-ministry/barnabas";
  else if (originalId && safeId === originalId) {
    if (root === "semesters" || root === "semestersPrivate") href = `/semester/${safeId}`;
    if (root === "retreats" || root === "retreatsPrivate") href = `/retreat/${safeId}${first.target.area === "field" ? "/field" : ""}`;
  }
  if (bulk) context = `${context} · ${targets.size}개 대상${targets.size > 30 ? ` · 추가 ${targets.size - 30}개는 요약 생략` : ""}`;
  if (date) context = `${context}${context ? " · " : ""}${date}`;
  const label = bulk ? `${first.target.label} 외 ${targets.size - 1}개 대상` : `${first.target.label}${subjectName ? ` · ${subjectName}` : ""}`;
  return {
    area: first.target.area,
    action: requestedAction,
    target: { path: first.parts.join("/"), label, ...(context ? { context: context.slice(0, 160) } : {}), ...(href ? { href } : {}) },
    changes,
    changedCount: Math.min(100000, bulk ? targets.size : Math.max(changes.length, first.target.fieldNames.size)),
  };
}
