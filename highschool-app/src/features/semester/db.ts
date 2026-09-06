// Firebase 접근 단일 지점 — 컴포넌트에서 firebase 직접 import 금지 (모노레포 컨벤션).
// 쓰기는 전부 경로 지정 update/set(단일 문서) — 노드 전체 덮어쓰기 함수를 만들지 말 것.

import { ref, get, onValue } from "firebase/database";
import { auditedUpdate as update, auditedRemove as remove } from "@/features/activityLog/write";
import { db } from "@/lib/firebase";
import { paths } from "./paths";
import {
  Application,
  ApplicationPrivate,
  ArchiveLink,
  AttendanceStatus,
  ClassInfo,
  ClassStudent,
  CompletionEntry,
  CurriculumEntry,
  NewFriend,
  NewFriendPrivate,
  Semester,
  SemesterAttendanceScope,
  SemesterMeta,
  Session,
  SessionAttendance,
  StaffPerson,
  Team,
  TrainingClass,
} from "./types";
import { buildTeamRemovalUpdates } from "./teamRemoval";
import { buildTrainingClassRemovalUpdates } from "./trainingClass";
import { makeAppKey } from "./applicant";
import { buildApplicationPrivateUpdates } from "./applicationPrivate";
import type { SessionValue } from "./sessionKind";
import {
  buildNewFriendPlacementCancellationUpdates,
  buildNewFriendRosterRegistrationUpdates,
  buildNewFriendRosterRemovalUpdates,
  findNewFriendDuplicate,
  newFriendRegisteredDate,
  studentIdForNewFriend,
  validateNewFriendRosterRegistration,
  validateNewFriendRosterRemoval,
} from "./newFriend";

import { snapToList } from "@/lib/db/core";


const nowISO = () => new Date().toISOString();
const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── 학기 ──────────────────────────────────────────────────────────────

export async function getSemesters(): Promise<Semester[]> {
  const snap = await get(ref(db, paths.semesters()));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, { meta: SemesterMeta }>)
    .map(([id, v]) => ({ id, meta: v.meta }))
    .filter((s) => !!s.meta)
    .sort((a, b) => b.id.localeCompare(a.id)); // 최신 학기 먼저
}

export function subscribeSemesters(
  cb: (semesters: Semester[]) => void,
  onError?: (e: Error) => void,
): () => void {
  let previousMetadata: string | undefined;
  return onValue(ref(db, paths.semesters()), (snap) => {
    const semesters = Object.entries((snap.val() ?? {}) as Record<string, { meta?: SemesterMeta }>)
      .filter(([, value]) => !!value.meta)
      .map(([id, value]) => ({ id, meta: value.meta! }))
      .sort((a, b) => b.id.localeCompare(a.id));
    // 출석·신청 갱신도 루트에 도착한다. 목록에 쓰는 meta가 같으면 React 상태와
    // 현재 학기에 연결된 하위 구독들을 다시 만들지 않는다. 첫 빈 목록은 전달한다.
    const metadata = JSON.stringify(semesters);
    if (metadata === previousMetadata) return;
    previousMetadata = metadata;
    cb(semesters);
  }, onError);
}

export async function createSemester(id: string, title: string): Promise<void> {
  const meta: SemesterMeta = {
    title,
    completionRule: { minRate: 0.7 },
    createdAt: nowISO(),
  };
  await update(ref(db, paths.semesterMeta(id)), meta);
}

/** 학기 전체 삭제 — 공개·비공개 노드를 한 번의 루트 update로 함께 지운다.
 *  되돌릴 수 없다. 화면에서 학기 ID를 직접 입력받아 확인한 뒤에만 호출한다. */
export async function removeSemester(sid: string): Promise<void> {
  await update(ref(db), {
    [paths.semester(sid)]: null,
    [paths.semesterPrivate(sid)]: null,
  });
}

export async function updateSemesterMeta(id: string, partial: Partial<SemesterMeta>): Promise<void> {
  await update(ref(db, paths.semesterMeta(id)), partial);
}

export function subscribeSemesterMeta(
  sid: string,
  cb: (meta: SemesterMeta | null) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.semesterMeta(sid)), (s) => cb(s.val()), onError);
}

// ── 팀 ────────────────────────────────────────────────────────────────

export function subscribeTeams(
  sid: string,
  cb: (teams: Team[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(
    ref(db, paths.teams(sid)),
    (s) => cb(snapToList<Team>(s).sort((a, b) => a.order - b.order)),
    onError,
  );
}

export async function addTeam(sid: string, name: string, color: string, order: number): Promise<void> {
  await update(ref(db, paths.team(sid, newId())), { name, color, order });
}

export async function updateTeam(sid: string, teamId: string, partial: Partial<Omit<Team, "id">>): Promise<void> {
  await update(ref(db, paths.team(sid, teamId)), partial);
}

export async function removeTeam(sid: string, teamId: string): Promise<void> {
  const applicationsSnap = await get(ref(db, paths.applications(sid)));
  const applications = applicationsSnap.exists()
    ? applicationsSnap.val() as Record<string, Omit<Application, "id">>
    : {};
  await update(ref(db), buildTeamRemovalUpdates(sid, teamId, applications));
}

// ── 훈련 반 ────────────────────────────────────────────────────────────
// 사역팀(teams)과 같은 형태지만 다른 축이다. 신청자는 훈련 반 + 사역팀 지망을 함께 가진다.

export function subscribeTrainingClasses(
  sid: string,
  cb: (classes: TrainingClass[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(
    ref(db, paths.trainingClasses(sid)),
    (s) => cb(snapToList<TrainingClass>(s).sort((a, b) => a.order - b.order)),
    onError,
  );
}

export async function addTrainingClass(sid: string, name: string, color: string, order: number): Promise<void> {
  await update(ref(db, paths.trainingClass(sid, newId())), { name, color, order });
}

export async function updateTrainingClass(
  sid: string,
  classId: string,
  partial: Partial<Omit<TrainingClass, "id">>,
): Promise<void> {
  await update(ref(db, paths.trainingClass(sid, classId)), partial);
}

export async function removeTrainingClass(sid: string, classId: string): Promise<void> {
  const applicationsSnap = await get(ref(db, paths.applications(sid)));
  const applications = applicationsSnap.exists()
    ? applicationsSnap.val() as Record<string, Omit<Application, "id">>
    : {};
  await update(ref(db), buildTrainingClassRemovalUpdates(sid, classId, applications));
}

// ── 회차 ──────────────────────────────────────────────────────────────

export function subscribeSessions(
  sid: string,
  cb: (sessions: Session[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(
    ref(db, paths.sessions(sid)),
    (s) => cb(snapToList<Session>(s).sort((a, b) => a.date.localeCompare(b.date))),
    onError,
  );
}

export async function addSession(sid: string, sess: Omit<Session, "id">): Promise<void> {
  await update(ref(db, paths.session(sid, newId())), sess);
}

export async function updateSession(sid: string, sessId: string, partial: Partial<Omit<Session, "id">>): Promise<void> {
  await update(ref(db, paths.session(sid, sessId)), partial);
}

/** 시작·종료일만 최소 경로로 갱신한다. 종료일을 비우면 기존 값을 실제로 제거한다. */
export async function updateSessionDates(
  sid: string,
  sessId: string,
  date: string,
  endDate?: string,
): Promise<void> {
  await update(ref(db, paths.session(sid, sessId)), { date, endDate: endDate ?? null });
}

/** 유형 변경 — 라벨을 비우려면 null을 써야 하므로 별도 함수로 둔다(sessionKind가 값을 만든다). */
export async function updateSessionKind(sid: string, sessId: string, value: SessionValue): Promise<void> {
  await update(ref(db, paths.session(sid, sessId)), { type: value.type, label: value.label });
}

export async function removeSession(sid: string, sessId: string): Promise<void> {
  await remove(ref(db, paths.session(sid, sessId)));
}

// ── 신청 ──────────────────────────────────────────────────────────────

// appKey 규칙은 순수 모듈(applicant.ts)이 원천이다. 여기서는 재수출만 한다.
export { isStaffAppKey, describeApplicant, STAFF_BU } from "./applicant";
export { makeAppKey };

export function subscribeApplications(
  sid: string,
  cb: (apps: Application[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.applications(sid)), (s) => cb(snapToList<Application>(s)), onError);
}

export async function upsertApplication(
  sid: string,
  app: Omit<Application, "id" | "createdAt"> & { createdAt?: string },
  priv?: ApplicationPrivate,
): Promise<void> {
  const appKey = makeAppKey(app.bu, app.studentId);
  await update(ref(db, paths.application(sid, appKey)), {
    ...app,
    createdAt: app.createdAt ?? nowISO(),
  });
  // 빈 값도 반드시 써야 한다 — 건너뛰면 "연락처 지우기"가 저장되지 않고 옛 값이 남는다.
  if (priv) {
    await update(ref(db, paths.applicationPrivate(sid, appKey)), buildApplicationPrivateUpdates(priv));
  }
}

export async function updateApplication(
  sid: string,
  appKey: string,
  partial: Partial<Omit<Application, "id">>,
): Promise<void> {
  await update(ref(db, paths.application(sid, appKey)), partial);
}

export async function removeApplication(sid: string, appKey: string): Promise<void> {
  await remove(ref(db, paths.application(sid, appKey)));
  await remove(ref(db, paths.applicationPrivate(sid, appKey)));
}

export async function getApplicationPrivate(sid: string, appKey: string): Promise<ApplicationPrivate | null> {
  const snap = await get(ref(db, paths.applicationPrivate(sid, appKey)));
  return snap.val();
}

/** 🔒 연락처·지원동기 전체 맵 — 접수 화면의 연락처 표시용.
 *  semestersPrivate는 행정 계열(admins/retreatAdmins)만 읽을 수 있다(Rules).
 *  조회 전용 역할에서는 호출하지 않는다. */
export function subscribeApplicationsPrivate(
  sid: string,
  cb: (map: Record<string, ApplicationPrivate>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.applicationsPrivate(sid)), (s) => cb(s.val() ?? {}), onError);
}

// ── 출석 ──────────────────────────────────────────────────────────────
// 사역팀(team)과 훈련(training)은 별도 원장이다. 기존 team 기록은 그대로 보존한다.
// 멱등 명시 상태 기록 — 토글 아님 (같은 상태를 다시 눌러도 동일 결과).

export function subscribeSessionAttendance(
  sid: string,
  scope: SemesterAttendanceScope,
  sessId: string,
  cb: (att: SessionAttendance) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.attendanceSession(sid, scope, sessId)), (s) => cb(s.val() ?? {}), onError);
}

export function subscribeAllAttendance(
  sid: string,
  scope: SemesterAttendanceScope,
  cb: (bySession: Record<string, SessionAttendance>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.attendanceByScope(sid, scope)), (s) => cb(s.val() ?? {}), onError);
}

export async function setAttendance(
  sid: string,
  scope: SemesterAttendanceScope,
  sessId: string,
  appKey: string,
  status: AttendanceStatus,
  byUid?: string,
  activityContext?: { subjectName?: string; date?: string },
): Promise<void> {
  await update(ref(db, paths.attendanceEntry(sid, scope, sessId, appKey)), {
    s: status,
    by: byUid ?? null,
    at: nowISO(),
  }, activityContext);
}

export async function clearAttendance(
  sid: string,
  scope: SemesterAttendanceScope,
  sessId: string,
  appKey: string,
  activityContext?: { subjectName?: string; date?: string },
): Promise<void> {
  await remove(ref(db, paths.attendanceEntry(sid, scope, sessId, appKey)), activityContext);
}

// ── 수료 체크리스트 ────────────────────────────────────────────────────

export function subscribeCompletion(
  sid: string,
  cb: (map: Record<string, CompletionEntry>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.completion(sid)), (s) => cb(s.val() ?? {}), onError);
}

export async function updateCompletionEntry(
  sid: string,
  appKey: string,
  partial: CompletionEntry,
): Promise<void> {
  await update(ref(db, paths.completionEntry(sid, appKey)), partial);
}

// ── 커리큘럼 ──────────────────────────────────────────────────────────

export function subscribeCurriculum(
  sid: string,
  teamId: string,
  cb: (map: Record<string, CurriculumEntry>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.curriculum(sid, teamId)), (s) => cb(s.val() ?? {}), onError);
}

export async function updateCurriculumEntry(
  sid: string,
  teamId: string,
  sessId: string,
  entry: CurriculumEntry,
): Promise<void> {
  await update(ref(db, paths.curriculumEntry(sid, teamId, sessId)), entry);
}

// ── 아카이브 링크 ──────────────────────────────────────────────────────

export function subscribeArchiveLinks(
  sid: string,
  cb: (links: ArchiveLink[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.archiveLinks(sid)), (s) => cb(snapToList<ArchiveLink>(s)), onError);
}

export async function addArchiveLink(sid: string, link: Omit<ArchiveLink, "id">): Promise<void> {
  await update(ref(db, paths.archiveLink(sid, newId())), link);
}

export async function removeArchiveLink(sid: string, linkId: string): Promise<void> {
  await remove(ref(db, paths.archiveLink(sid, linkId)));
}

// ── 학생 원장 조회 (classes — 학생 출석부 앱 소유) ──
// 쓰기는 아래 registerNewFriendInRoster의 canWriteStudentRoster 허용 역할 단건 등록 예외만 허용한다.

export async function getClassesByYear(year: string): Promise<ClassInfo[]> {
  const snap = await get(ref(db, paths.classesByYear(year)));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<ClassInfo, "classKey">>).map(
    ([classKey, data]) => ({ classKey, teacher: data.teacher, students: data.students ?? {} }),
  );
}

export function subscribeClassesByYear(
  year: string,
  cb: (classes: ClassInfo[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.classesByYear(year)), (snap) => {
    if (!snap.exists()) return cb([]);
    cb(Object.entries(snap.val() as Record<string, Omit<ClassInfo, "classKey">>).map(
      ([classKey, data]) => ({ classKey, teacher: data.teacher, students: data.students ?? {} }),
    ));
  }, onError);
}

// ── 읽기 전용: 공식스탭 명단 (teacherStaff — 학생 출석 앱 소유. 쓰기 함수 추가 금지) ──

export async function getStaffByYear(year: string): Promise<StaffPerson[]> {
  const snap = await get(ref(db, paths.teacherStaffByYear(year)));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, { name?: string; title?: string; phone?: string; personId?: string }>)
    .filter(([, value]) => value?.name?.trim())
    .map(([staffId, value]) => ({
      staffId,
      ...(value.personId?.trim() ? { personId: value.personId.trim() } : {}),
      name: value.name!.trim(),
      ...(value.title?.trim() ? { title: value.title.trim() } : {}),
      ...(value.phone?.trim() ? { phone: value.phone.trim() } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function subscribeStaffByYear(
  year: string,
  cb: (staff: StaffPerson[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.teacherStaffByYear(year)), (snap) => {
    if (!snap.exists()) return cb([]);
    cb(Object.entries(snap.val() as Record<string, { name?: string; title?: string; phone?: string; personId?: string }>)
      .filter(([, value]) => value?.name?.trim())
      .map(([staffId, value]) => ({
        staffId,
        ...(value.personId?.trim() ? { personId: value.personId.trim() } : {}),
        name: value.name!.trim(),
        ...(value.title?.trim() ? { title: value.title.trim() } : {}),
        ...(value.phone?.trim() ? { phone: value.phone.trim() } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")));
  }, onError);
}

// ── 새친구 ────────────────────────────────────────────────────────────
// 운영 단계는 semesters, 연락처·주소·심방 메모는 semestersPrivate에 분리한다.

export function subscribeNewFriends(
  sid: string,
  cb: (friends: NewFriend[]) => void,
  onError?: (e: Error) => void,
) {
  return onValue(
    ref(db, paths.newFriends(sid)),
    (s) => cb(snapToList<NewFriend>(s).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    onError,
  );
}

export function subscribeNewFriendsPrivate(
  sid: string,
  cb: (values: Record<string, NewFriendPrivate>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.newFriendsPrivate(sid)), (s) => cb(s.val() ?? {}), onError);
}

function privateFieldUpdates(
  sid: string,
  friendId: string,
  value: NewFriendPrivate,
): Record<string, string | null> {
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => [
    `${paths.newFriendPrivate(sid, friendId)}/${key}`,
    typeof raw === "string" && raw.trim() ? raw.trim() : null,
  ]));
}

export async function saveNewFriend(
  sid: string,
  friend: Omit<NewFriend, "id"> & { id?: string },
  priv: NewFriendPrivate,
): Promise<string> {
  const id = friend.id ?? newId();
  const publicFields: Array<keyof Omit<NewFriend, "id">> = [
    "name", "part", "gender", "school", "grade", "owner", "decision", "week1Date",
    "week2Date", "registeredDate", "inviter", "faithStep", "assignedClassKey", "giftDate", "createdAt",
    "createdBy", "updatedAt", "rosterSync",
  ];
  const publicUpdates = Object.fromEntries(publicFields.map((key) => {
    const value = key === "registeredDate" ? newFriendRegisteredDate(friend) : friend[key];
    return [`${paths.newFriend(sid, id)}/${key}`, value === undefined || value === "" ? null : value];
  }));
  await update(ref(db), {
    ...publicUpdates,
    ...privateFieldUpdates(sid, id, priv),
  });
  return id;
}

export async function removeNewFriend(sid: string, friend: NewFriend): Promise<void> {
  if (friend.rosterSync) throw new Error("출석부에 반영된 새친구 기록은 삭제할 수 없습니다.");
  await update(ref(db), {
    [paths.newFriend(sid, friend.id)]: null,
    [paths.newFriendPrivate(sid, friend.id)]: null,
  });
}

export interface CancelNewFriendPlacementResult {
  removedFromRoster: boolean;
  studentId?: string;
  classKey?: string;
}

/**
 * 새친구 기록은 보존하고 등반·반배정·출석부 연결만 안전하게 되돌린다.
 * 출석부에 반영된 경우는 canWriteStudentRoster 허용 역할만 호출하며, 사전 백업·휴지통·재조회 검증을 유지한다.
 */
export async function cancelNewFriendPlacement(
  sid: string,
  friend: NewFriend,
  priv: NewFriendPrivate,
  canceledBy?: string,
): Promise<CancelNewFriendPlacementResult> {
  if (!friend.giftDate && !friend.assignedClassKey && !friend.rosterSync) {
    throw new Error("등반 또는 반 배정 기록이 없어 취소할 수 없습니다.");
  }
  const [friendSnap, privateSnap] = await Promise.all([
    get(ref(db, paths.newFriend(sid, friend.id))),
    get(ref(db, paths.newFriendPrivate(sid, friend.id))),
  ]);
  if (!friendSnap.exists()) throw new Error("새친구 기록을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
  const currentFriend = { ...friendSnap.val(), id: friend.id } as NewFriend;
  const expectedSync = friend.rosterSync;
  const currentSync = currentFriend.rosterSync;
  if (
    Boolean(expectedSync) !== Boolean(currentSync)
    || (expectedSync && currentSync && (
      expectedSync.studentId !== currentSync.studentId
      || expectedSync.classKey !== currentSync.classKey
    ))
  ) {
    throw new Error("출석부 연결 정보가 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.");
  }

  const currentPrivate = privateSnap.exists() ? privateSnap.val() as NewFriendPrivate : priv;
  const canceledAtMs = Date.now();
  const canceledAt = new Date(canceledAtMs).toISOString();
  let student: ClassStudent | null = null;
  let attendance: unknown = null;
  let year: string | undefined;
  let studentPath: string | undefined;
  let attendancePath: string | undefined;
  let backupPath: string | undefined;

  if (currentSync) {
    year = sid.match(/^\d{4}/)?.[0];
    if (!year) throw new Error("새친구 기록의 연도를 확인할 수 없습니다.");
    studentPath = paths.classStudent(year, currentSync.classKey, currentSync.studentId);
    attendancePath = paths.studentAttendance(year, currentSync.classKey, currentSync.studentId);
    const [studentSnap, attendanceSnap] = await Promise.all([
      get(ref(db, studentPath)),
      get(ref(db, attendancePath)),
    ]);
    student = studentSnap.exists() ? studentSnap.val() as ClassStudent : null;
    attendance = attendanceSnap.val();
    const validationError = validateNewFriendRosterRemoval(currentFriend, student);
    if (validationError) throw new Error(validationError);
    backupPath = paths.newFriendPlacementCancellationBackup(sid, friend.id, String(canceledAtMs));
  }

  await update(ref(db), buildNewFriendPlacementCancellationUpdates({
    sid,
    year,
    friend: currentFriend,
    priv: currentPrivate,
    student,
    attendance,
    canceledAt,
    canceledAtMs,
    canceledBy,
  }));

  const refreshedFriendSnap = await get(ref(db, paths.newFriend(sid, friend.id)));
  if (!refreshedFriendSnap.exists()) throw new Error("취소 후 새친구 기록 보존 검증에 실패했습니다.");
  const refreshedFriend = refreshedFriendSnap.val() as NewFriend;
  if (refreshedFriend.assignedClassKey || refreshedFriend.giftDate || refreshedFriend.rosterSync) {
    throw new Error("취소 후 등반·배정 정보 재조회 검증에 실패했습니다.");
  }

  if (currentSync && year && studentPath && attendancePath && backupPath) {
    const [removedStudentSnap, removedAttendanceSnap, backupSnap, trashSnap] = await Promise.all([
      get(ref(db, studentPath)),
      get(ref(db, attendancePath)),
      get(ref(db, backupPath)),
      student ? get(ref(db, paths.trashStudent(year, currentSync.studentId))) : Promise.resolve(null),
    ]);
    if (removedStudentSnap.exists() || removedAttendanceSnap.exists() || !backupSnap.exists() || (trashSnap && !trashSnap.exists())) {
      throw new Error("취소 후 출석부·백업 재조회 검증에 실패했습니다.");
    }
    return { removedFromRoster: true, studentId: currentSync.studentId, classKey: currentSync.classKey };
  }
  return { removedFromRoster: false };
}

export interface RemoveNewFriendFromRosterResult {
  studentId: string;
  classKey: string;
}

/**
 * canWriteStudentRoster 허용 역할 전용 새친구 등록 되돌리기.
 * 이 화면에서 만든 결정적 nf_ 학생만 대상으로 하고, 비공개 백업과 학생 앱 휴지통을 남긴 뒤
 * 학생·출석·새친구 공개·비공개 기록을 하나의 루트 update로 삭제한다.
 */
export async function removeNewFriendFromRoster(
  sid: string,
  friend: NewFriend,
  priv: NewFriendPrivate,
  removedBy?: string,
): Promise<RemoveNewFriendFromRosterResult> {
  if (!friend.rosterSync) throw new Error("출석부 반영 이력이 없습니다.");
  const year = sid.match(/^\d{4}/)?.[0];
  if (!year) throw new Error("새친구 기록의 연도를 확인할 수 없습니다.");
  const [friendSnap, privateSnap] = await Promise.all([
    get(ref(db, paths.newFriend(sid, friend.id))),
    get(ref(db, paths.newFriendPrivate(sid, friend.id))),
  ]);
  if (!friendSnap.exists()) throw new Error("새친구 기록을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
  const currentFriend = { ...friendSnap.val(), id: friend.id } as NewFriend;
  if (!currentFriend.rosterSync) throw new Error("현재 새친구 기록에 출석부 반영 이력이 없습니다.");
  if (
    currentFriend.rosterSync.studentId !== friend.rosterSync.studentId
    || currentFriend.rosterSync.classKey !== friend.rosterSync.classKey
  ) {
    throw new Error("출석부 연결 정보가 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.");
  }
  const currentPrivate = privateSnap.exists() ? privateSnap.val() as NewFriendPrivate : priv;
  const { studentId, classKey } = currentFriend.rosterSync;
  const studentPath = paths.classStudent(year, classKey, studentId);
  const attendancePath = paths.studentAttendance(year, classKey, studentId);
  const [studentSnap, attendanceSnap] = await Promise.all([
    get(ref(db, studentPath)),
    get(ref(db, attendancePath)),
  ]);
  const student = studentSnap.exists() ? studentSnap.val() as ClassStudent : null;
  const validationError = validateNewFriendRosterRemoval(currentFriend, student);
  if (validationError) throw new Error(validationError);

  const removedAtMs = Date.now();
  const removedAt = new Date(removedAtMs).toISOString();
  const backupPath = paths.newFriendRemovalBackup(sid, friend.id, String(removedAtMs));
  await update(ref(db), buildNewFriendRosterRemovalUpdates({
    sid,
    year,
    friend: currentFriend,
    priv: currentPrivate,
    student,
    attendance: attendanceSnap.val(),
    removedAt,
    removedAtMs,
    removedBy,
  }));

  const verificationPaths = [
    studentPath,
    attendancePath,
    paths.newFriend(sid, friend.id),
    paths.newFriendPrivate(sid, friend.id),
  ];
  const [removedSnaps, backupSnap, trashSnap] = await Promise.all([
    Promise.all(verificationPaths.map((path) => get(ref(db, path)))),
    get(ref(db, backupPath)),
    student ? get(ref(db, paths.trashStudent(year, studentId))) : Promise.resolve(null),
  ]);
  if (removedSnaps.some((snapshot) => snapshot.exists()) || !backupSnap.exists() || (trashSnap && !trashSnap.exists())) {
    throw new Error("삭제 후 재조회 검증에 실패했습니다. 학생 출석부와 새친구 명단을 확인해 주세요.");
  }
  return { studentId, classKey };
}

export interface RegisterNewFriendResult {
  studentId: string;
  classKey: string;
  alreadySynced: boolean;
}

/**
 * canWriteStudentRoster 허용 역할 전용 출석부 반영.
 * 현재 학기 역할 superAdmin·adminTeam만 UI capability와 Rules 양쪽에서 학생 단건 쓰기가 허용된다.
 * 새친구 ID 기반 학생 ID를 사용하고 루트 다중 경로 update로 학생 생성+반영 이력을 원자 처리한다.
 */
export async function registerNewFriendInRoster(
  sid: string,
  friend: NewFriend,
  priv: NewFriendPrivate,
  syncedBy?: string,
): Promise<RegisterNewFriendResult> {
  const validationError = validateNewFriendRosterRegistration(friend);
  if (validationError) throw new Error(validationError);

  const year = sid.split("-")[0];
  const classKey = friend.assignedClassKey!;
  const studentId = studentIdForNewFriend(friend.id);
  const classes = await getClassesByYear(year);
  const targetClass = classes.find((item) => item.classKey === classKey);
  if (!targetClass) throw new Error(`배정 반(${classKey})이 출석부에 없습니다.`);

  const deterministicExisting = targetClass.students[studentId];
  if (friend.rosterSync && deterministicExisting) {
    return { studentId, classKey, alreadySynced: true };
  }
  if (deterministicExisting) {
    const syncedAt = nowISO();
    await update(ref(db, paths.newFriend(sid, friend.id)), {
      rosterSync: { studentId, classKey, syncedAt, ...(syncedBy ? { syncedBy } : {}) },
      updatedAt: syncedAt,
    });
    return { studentId, classKey, alreadySynced: true };
  }

  const duplicate = findNewFriendDuplicate(classes, friend, priv);
  if (duplicate) {
    throw new Error(`${duplicate.name} 학생이 ${duplicate.classKey}에 있습니다. ${duplicate.reason} - 자동 반영을 중단했습니다.`);
  }

  const syncedAt = nowISO();
  await update(ref(db), buildNewFriendRosterRegistrationUpdates({
    sid,
    year,
    friend,
    priv,
    studentId,
    classKey,
    syncedAt,
    syncedBy,
  }));

  const verifySnap = await get(ref(db, paths.classStudent(year, classKey, studentId)));
  if (!verifySnap.exists()) throw new Error("출석부 반영 후 재조회에 실패했습니다. 관리자에게 확인해 주세요.");
  return { studentId, classKey, alreadySynced: false };
}
