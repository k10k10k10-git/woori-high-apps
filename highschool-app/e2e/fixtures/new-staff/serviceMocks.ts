import type { Group, Milestone, Retreat, RetreatProgram } from "@/lib/types";
import type { IguardAccessLock } from "@/features/iguard/lib/types";
import type { ArchiveLink } from "@/features/semester/types";
import { connect, memoryWrite, qa } from "./qaState";

type Receive<T> = (value: T) => void;
type Failure = (error: Error) => void;
const retreat: Retreat = { id: "synthetic-retreat", name: "합성 가을 수련회", year: 2026, sheetId: "", sheetGid: "", createdAt: 1, groupCount: 1 };
const groups: Group[] = [{ id: "group-1", name: "합성 1조", bu: "1부", teachers: [], leader: "", studentIds: [] }];
const milestones: Milestone[] = [7, 8, 9, 11].map((day) => ({ id: `milestone-${day}`, title: `합성 준비 일정 ${day}`, targetDate: `2026-10-${String(day).padStart(2, "0")}`, done: false, sourceSite: "retreat" }));
const programs: RetreatProgram[] = [
  { id: "program-main", title: "합성 전체 프로그램", order: 1, kind: "main", status: "draft", date: "2026-10-16", summary: "모두 함께 참여합니다", flow: "합성 원본 진행안", createdAt: 1, updatedAt: 1 },
  { id: "program-post", title: "합성 조별 프로그램", order: 2, kind: "post", status: "draft", date: "2026-10-17", summary: "조별로 이동합니다", flow: "합성 두 번째 진행안", createdAt: 1, updatedAt: 1 },
];

// QA 전용 브라우저 저장소만 사용해 삭제 중단 뒤 새로고침을 재현한다.
const archiveStorageKey = "woori-new-staff-qa-archive-v1";
let archives: ArchiveLink[] = JSON.parse(sessionStorage.getItem(archiveStorageKey) ?? "null") ?? [
  { id: "archive-file", title: "합성 보관 파일", kind: "doc", url: "http://127.0.0.1:4179/__qa__/stored.pdf", filePath: "synthetic/2026-2/archive.pdf", fileName: "합성문서.pdf", fileSize: 2048 },
  { id: "archive-pending", title: "합성 삭제 대기 자료", kind: "doc", url: "http://127.0.0.1:4179/__qa__/removed.pdf", deletionPending: true },
];
function publishArchives(sid: string) {
  sessionStorage.setItem(archiveStorageKey, JSON.stringify(archives));
  qa.emit("archiveLinks", sid, archives);
}
export function subscribeArchiveLinks(sid: string, cb: Receive<ArchiveLink[]>, fail?: Failure) { return connect("archiveLinks", sid, cb, archives, fail); }
export async function markArchiveLinkDeleting(sid: string, id: string) {
  await memoryWrite("markArchiveLinkDeleting")(sid, id);
  if (!archives.some((link) => link.id === id)) return false;
  archives = archives.map((link) => link.id === id ? { ...link, deletionPending: true } : link);
  publishArchives(sid);
  return true;
}
export async function removeArchiveLink(sid: string, id: string) {
  await memoryWrite("removeArchiveLink")(sid, id);
  archives = archives.filter((link) => link.id !== id);
  publishArchives(sid);
}
export async function addArchiveLink(sid: string, link: Omit<ArchiveLink, "id">) {
  const id = await memoryWrite("addArchiveLink")(sid, link);
  archives = [...archives, { ...link, id }];
  publishArchives(sid);
}
export const deleteSemesterArchiveFile = memoryWrite("deleteSemesterArchiveFile");
export async function uploadSemesterArchiveFile(sid: string, file: File, onProgress?: (percent: number) => void) {
  await memoryWrite("uploadSemesterArchiveFile")(sid, file.name);
  onProgress?.(100);
  return { filePath: `synthetic/${sid}/${file.name}`, fileUrl: "http://127.0.0.1:4179/__qa__/uploaded.pdf" };
}

export function subscribeToRetreats(cb: Receive<Retreat[]>, fail?: Failure) { return connect("retreats", "", cb, [retreat], fail); }
export function subscribeToRetreat(id: string, cb: Receive<Retreat | null>, fail?: Failure) { return connect("retreat", id, cb, { ...retreat, id }, fail); }
export function subscribeToMilestones(cb: Receive<Milestone[]>, fail?: Failure) { return connect("milestones", "", cb, milestones, fail); }
export function subscribeToAllRetreatPeriods(ids: string[], cb: Receive<unknown[]>, fail?: Failure) {
  return connect("periods", ids.join(","), cb, ids.map((id) => ({ id: "period-1", retreatId: id, label: "가을", startDate: "2026-10-16", endDate: "2026-10-18" })), fail);
}
export function subscribeToConnection(cb: Receive<boolean>, fail?: Failure) { return connect("connection", "", cb, true, fail); }
export function subscribeToGroups(id: string, cb: Receive<Group[]>, fail?: Failure) { return connect("groups", id, cb, groups, fail); }
export function subscribeToRetreatPrograms(id: string, cb: Receive<RetreatProgram[]>, fail?: Failure) { return connect("programs", id, cb, programs, fail); }
export function subscribeToRetreatProgramMeetings(id: string, cb: Receive<Record<string, unknown>>, fail?: Failure) {
  return connect("programMeetings", id, cb, { "program-main": { "meeting-private": { id: "meeting-private", title: "합성 비공개 회의", date: "2026-10-07", createdAt: 1, updatedAt: 1 } } }, fail);
}
export function subscribeToIguardAccessLock(id: string, cb: Receive<IguardAccessLock | null>, fail?: Failure) { return connect("accessLock", id, cb, null, fail); }
export function subscribeToMySiteRequests(uid: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("myRequests", uid, cb, [], fail); }
export function subscribeToAdminSiteRequests(cb: Receive<unknown[]>, fail?: Failure) { return connect("adminRequests", "", cb, [], fail); }
export function subscribeSundayNewFriends(cb: Receive<unknown[]>, fail?: Failure) { return connect("newFriends", "", cb, [], fail); }
export function subscribeToMainAdmins(cb: Receive<Record<string, unknown>>, fail?: Failure) { return connect("mainAdmins", "", cb, {}, fail); }
export function subscribeToRetreatAdmins(cb: Receive<Record<string, unknown>>, fail?: Failure) { return connect("retreatAdmins", "", cb, {}, fail); }
export function subscribeToPendingRequests(cb: Receive<Record<string, unknown>>, fail?: Failure) { return connect("pendingRequests", "", cb, {}, fail); }
export function subscribeToIguardMembers(cb: Receive<Record<string, unknown>>, fail?: Failure) { return connect("iguardMembers", "", cb, {}, fail); }
export function subscribeToIguardPending(cb: Receive<Record<string, unknown>>, fail?: Failure) { return connect("iguardPending", "", cb, {}, fail); }
export function subscribeToIguardGroupStaff(id: string, cb: Receive<Record<string, string[]>>, fail?: Failure) { return connect("groupStaff", id, cb, {}, fail); }
export function subscribeToTeacherAttendances(id: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("teacherAttendance", id, cb, [], fail); }
export function subscribeToIguardSchedule(id: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("iguardSchedule", id, cb, [], fail); }
export function subscribeToIguardSegments(id: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("iguardSegments", id, cb, [], fail); }
export function subscribeToIguardMovements(id: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("iguardMovements", id, cb, [], fail); }
export function subscribeToIguardPosts(id: string, cb: Receive<unknown[]>, fail?: Failure) { return connect("iguardPosts", id, cb, [], fail); }

// 모든 쓰기는 메모리 기록뿐이다. 공유·삭제도 운영 DB/API에 연결하지 않는다.
export const saveMilestone = memoryWrite("saveMilestone");
export const updateMilestone = memoryWrite("updateMilestone");
export const deleteMilestone = memoryWrite("deleteMilestone");
export const createDefaultRetreatPrograms = memoryWrite("createDefaultRetreatPrograms");
export const createRetreatProgram = memoryWrite("createRetreatProgram");
export const createRetreatProgramMeeting = memoryWrite("createRetreatProgramMeeting");
export const createRetreatProgramDecision = memoryWrite("createRetreatProgramDecision");
export const convertRetreatProgramDecisionToTask = memoryWrite("convertRetreatProgramDecisionToTask");
export const createDefaultRetreatProgramCompetitionTeams = memoryWrite("createDefaultRetreatProgramCompetitionTeams");
export const createRetreatProgramCompetitionTeam = memoryWrite("createRetreatProgramCompetitionTeam");
export const createRetreatProgramItem = memoryWrite("createRetreatProgramItem");
export const createRetreatProgramMatch = memoryWrite("createRetreatProgramMatch");
export const createRetreatProgramPost = memoryWrite("createRetreatProgramPost");
export const createRetreatProgramPosts = memoryWrite("createRetreatProgramPosts");
export const createRetreatProgramRole = memoryWrite("createRetreatProgramRole");
export const createRetreatProgramTask = memoryWrite("createRetreatProgramTask");
export const deleteRetreatProgram = memoryWrite("deleteRetreatProgram");
export const deleteRetreatProgramCompetitionTeam = memoryWrite("deleteRetreatProgramCompetitionTeam");
export const deleteRetreatProgramItem = memoryWrite("deleteRetreatProgramItem");
export const deleteRetreatProgramMatch = memoryWrite("deleteRetreatProgramMatch");
export const deleteRetreatProgramPost = memoryWrite("deleteRetreatProgramPost");
export const deleteRetreatProgramRole = memoryWrite("deleteRetreatProgramRole");
export const deleteRetreatProgramTask = memoryWrite("deleteRetreatProgramTask");
export const restoreRetreatProgramTask = memoryWrite("restoreRetreatProgramTask");
export const restoreRetreatProgramItem = memoryWrite("restoreRetreatProgramItem");
export const restoreRetreatProgramCompetitionTeam = memoryWrite("restoreRetreatProgramCompetitionTeam");
export const restoreRetreatProgramMatch = memoryWrite("restoreRetreatProgramMatch");
export const restoreRetreatProgramPost = memoryWrite("restoreRetreatProgramPost");
export const restoreRetreatProgramRole = memoryWrite("restoreRetreatProgramRole");
export const reorderRetreatProgramPosts = memoryWrite("reorderRetreatProgramPosts");
export const reorderRetreatPrograms = memoryWrite("reorderRetreatPrograms");
export const updateRetreatProgram = memoryWrite("updateRetreatProgram");
export const updateRetreatProgramMeeting = memoryWrite("updateRetreatProgramMeeting");
export const updateRetreatProgramDecision = memoryWrite("updateRetreatProgramDecision");
export const updateRetreatProgramCompetitionTeam = memoryWrite("updateRetreatProgramCompetitionTeam");
export const updateRetreatProgramItem = memoryWrite("updateRetreatProgramItem");
export const updateRetreatProgramMatch = memoryWrite("updateRetreatProgramMatch");
export const updateRetreatProgramPost = memoryWrite("updateRetreatProgramPost");
export const updateRetreatProgramRole = memoryWrite("updateRetreatProgramRole");
export const updateRetreatProgramTask = memoryWrite("updateRetreatProgramTask");
export const assignRetreatGroupToProgramCompetitionTeam = memoryWrite("assignRetreatGroupToProgramCompetitionTeam");
export const replaceRetreatProgramCompetitionAssignments = memoryWrite("replaceRetreatProgramCompetitionAssignments");
export const publishRetreatProgramRelease = memoryWrite("publishRetreatProgramRelease");
export const unpublishRetreatProgramRelease = memoryWrite("unpublishRetreatProgramRelease");
