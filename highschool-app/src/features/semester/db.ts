// Firebase 접근 단일 지점 — 컴포넌트에서 firebase 직접 import 금지 (모노레포 컨벤션).
// 쓰기는 전부 경로 지정 update/set(단일 문서) — 노드 전체 덮어쓰기 함수를 만들지 말 것.

import {
  ref,
  get,
  update,
  remove,
  onValue,
  DataSnapshot,
} from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "./paths";
import {
  Application,
  ApplicationPrivate,
  ArchiveLink,
  AttendanceStatus,
  ClassInfo,
  CompletionEntry,
  CurriculumEntry,
  Semester,
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
import type { SessionValue } from "./sessionKind";

function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, object>).map(
    ([id, data]) => ({ id, ...data } as T),
  );
}

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

export async function createSemester(id: string, title: string): Promise<void> {
  const meta: SemesterMeta = {
    title,
    completionRule: { minRate: 0.7 },
    createdAt: nowISO(),
  };
  await update(ref(db, paths.semesterMeta(id)), meta);
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
  if (priv && Object.values(priv).some((v) => v != null && v !== "")) {
    await update(ref(db, paths.applicationPrivate(sid, appKey)), priv);
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
// 멱등 명시 상태 기록 — 토글 아님 (같은 상태를 다시 눌러도 동일 결과).

export function subscribeSessionAttendance(
  sid: string,
  sessId: string,
  cb: (att: SessionAttendance) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, paths.teamAttendance(sid, sessId)), (s) => cb(s.val() ?? {}), onError);
}

export function subscribeAllAttendance(
  sid: string,
  cb: (bySession: Record<string, SessionAttendance>) => void,
  onError?: (e: Error) => void,
) {
  return onValue(ref(db, `${paths.semester(sid)}/attendance/team`), (s) => cb(s.val() ?? {}), onError);
}

export async function setAttendance(
  sid: string,
  sessId: string,
  appKey: string,
  status: AttendanceStatus,
  byUid?: string,
): Promise<void> {
  await update(ref(db, paths.teamAttendanceEntry(sid, sessId, appKey)), {
    s: status,
    by: byUid ?? null,
    at: nowISO(),
  });
}

export async function clearAttendance(sid: string, sessId: string, appKey: string): Promise<void> {
  await remove(ref(db, paths.teamAttendanceEntry(sid, sessId, appKey)));
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

// ── 읽기 전용: 학생 원장 (classes — 학생 출석부 앱 소유. 쓰기 함수 추가 금지) ──

export async function getClassesByYear(year: string): Promise<ClassInfo[]> {
  const snap = await get(ref(db, paths.classesByYear(year)));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<ClassInfo, "classKey">>).map(
    ([classKey, data]) => ({ classKey, teacher: data.teacher, students: data.students ?? {} }),
  );
}

// ── 읽기 전용: 공식스탭 명단 (teacherStaff — 교사·스탭 출석부 앱 소유. 쓰기 함수 추가 금지) ──

export async function getStaffByYear(year: string): Promise<StaffPerson[]> {
  const snap = await get(ref(db, paths.teacherStaffByYear(year)));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, { name?: string; title?: string; phone?: string }>)
    .filter(([, value]) => value?.name?.trim())
    .map(([staffId, value]) => ({
      staffId,
      name: value.name!.trim(),
      ...(value.title?.trim() ? { title: value.title.trim() } : {}),
      ...(value.phone?.trim() ? { phone: value.phone.trim() } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
