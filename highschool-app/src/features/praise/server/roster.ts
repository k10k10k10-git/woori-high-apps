import "server-only";
import { paths as semesterPaths } from "@/features/semester/paths";
import { STAFF_BU, makeAppKey } from "@/features/semester/applicant";
import { validateIntake } from "@/features/semester/intakeRule";
import type { Application } from "@/features/semester/types";
import type {
  PraisePersonInput,
  PraiseRosterLink,
  PraiseState,
} from "../types";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";
import { requireValue } from "./validation";
import { fingerprint } from "./stageModel";

export type PraiseRosterCandidate = {
  applicationKey: string;
  kind: "STUDENT" | "STAFF";
  name: string;
  grade: number;
  department: "FIRST" | "SECOND";
  rosterLink: PraiseRosterLink;
};
export function rosterCandidate(
  applicationKey: string,
  source: Application,
  semesterId: string,
  teamId: string,
): PraiseRosterCandidate | null {
  if (
    source.status !== "배치" ||
    source.teamId !== teamId ||
    source.trainingOnly ||
    !source.studentId ||
    !source.name?.trim() ||
    makeAppKey(source.bu, source.studentId) !== applicationKey
  )
    return null;
  const staff = source.bu === STAFF_BU;
  if (
    !staff &&
    (!["1부", "2부"].includes(source.bu) || ![1, 2, 3].includes(source.grade))
  )
    return null;
  if (
    !validateIntake(
      {
        trainingClassId: source.trainingClassId ?? "",
        ministryChoice1: source.choice1 ?? teamId,
        assignedTeamId: teamId,
      },
      source,
      semesterId,
    ).ok
  )
    return null;
  const year = semesterId.match(/^\d{4}/)?.[0];
  return {
    applicationKey,
    kind: staff ? "STAFF" : "STUDENT",
    name: source.name.trim(),
    grade: staff ? 0 : source.grade,
    department: source.bu === "2부" ? "SECOND" : "FIRST",
    rosterLink: {
      applicationKey,
      ...(source.personId ? { personId: source.personId } : {}),
      ...(year ? { year } : {}),
      ...(staff
        ? { staffId: source.studentId }
        : {
            studentId: source.studentId,
            classKey: `${source.bu === "2부" ? 2 : 1}-${source.grade}-${source.class}`,
          }),
    },
  };
}
export async function praiseRoster(state: PraiseState) {
  const { semesterId, teamId } = state.meta;
  if (!semesterId || !teamId) return { people: [], semesterHref: null };
  let raw: Record<string, Application> | null;
  try {
    raw = (
      await getPraiseFirebaseAdmin()
        .database.ref(semesterPaths.applications(semesterId))
        .orderByChild("teamId")
        .equalTo(teamId)
        .get()
    ).val();
  } catch {
    throw praiseUnavailable("roster_unavailable");
  }
  const people = Object.entries(raw ?? {})
    .flatMap(([id, source]) => {
      const candidate = rosterCandidate(id, source, semesterId, teamId);
      return candidate ? [candidate] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return {
    people,
    semesterHref: `/semester/${encodeURIComponent(semesterId)}?tab=${encodeURIComponent("배치")}`,
  };
}
export async function validatePraiseRosterLink(
  state: PraiseState,
  person: PraisePersonInput,
) {
  if (!person.rosterLink || !Object.keys(person.rosterLink).length) return;
  const old = state.people[person.id];
  // 과거 원본 연결은 최신 명단에서 사라져도 해제·재작성하지 않는다. 기본 정보가 같은 속성 수정은 허용한다.
  if (
    old &&
    fingerprint(old.rosterLink) === fingerprint(person.rosterLink) &&
    old.name === person.name &&
    old.grade === person.grade &&
    old.kind === person.kind &&
    old.department === person.department
  )
    return;
  const { semesterId, teamId } = state.meta;
  requireValue(
    semesterId && teamId && person.rosterLink.applicationKey,
    "운영 학기·팀을 연결한 뒤 정식 배치 명단에서 인물을 선택해 주세요.",
  );
  let source: Application | null;
  try {
    source = (
      await getPraiseFirebaseAdmin()
        .database.ref(
          semesterPaths.application(
            semesterId,
            person.rosterLink.applicationKey,
          ),
        )
        .get()
    ).val();
  } catch {
    throw praiseUnavailable("roster_unavailable");
  }
  const candidate = source
    ? rosterCandidate(
        person.rosterLink.applicationKey,
        source,
        semesterId,
        teamId,
      )
    : null;
  requireValue(
    candidate &&
      fingerprint(candidate.rosterLink) === fingerprint(person.rosterLink) &&
      candidate.kind === person.kind &&
      candidate.name === person.name &&
      candidate.grade === person.grade &&
      (person.kind === "STAFF" || candidate.department === person.department),
    "연결할 인물의 학기 배치와 기본 정보가 바뀌었습니다. 명단을 새로고침해 다시 선택해 주세요.",
    "roster_changed",
    409,
  );
}
