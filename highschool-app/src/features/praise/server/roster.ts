import "server-only";
import { paths as semesterPaths } from "@/features/semester/paths";
import { STAFF_BU, makeAppKey } from "@/features/semester/applicant";
import { validateIntake } from "@/features/semester/intakeRule";
import type { Application } from "@/features/semester/types";
import { normalizeName } from "@/lib/studentMatcher";
import { uniqueRosterStudent } from "@/lib/rosterIdentity";
import type {
  PraisePersonInput,
  PraiseRosterLink,
  PraiseState,
} from "../types";
import { getPraiseAdmin, praiseUnavailable, type PraiseAdminDatabase } from "./supabaseAdmin";
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
type MainRosterIdentity = { name?: string; personId?: string };
function safeFirebaseSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[.#$\[\]/\u0000-\u001f\u007f]/.test(value)
  );
}
export function rosterCandidate(
  applicationKey: string,
  source: Application,
  semesterId: string,
  teamId: string,
): PraiseRosterCandidate | null {
  if (
    !source ||
    typeof source !== "object" ||
    !safeFirebaseSegment(applicationKey) ||
    !safeFirebaseSegment(source.studentId) ||
    typeof source.bu !== "string" ||
    typeof source.name !== "string" ||
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
    (
      !["1부", "2부"].includes(source.bu) ||
      ![1, 2, 3].includes(source.grade) ||
      !Number.isSafeInteger(source.class) ||
      source.class < 1 ||
      source.class > 99
    )
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
function validPersonNamespace(kind: PraiseRosterCandidate["kind"], personId: string) {
  return personId.startsWith(kind === "STAFF" ? "person_staff_" : "person_student_");
}
/** 학기 신청과 학생·스탭 메인 원장이 같은 기존 ID를 가리키는 후보만 반환한다. */
export function verifiedRosterCandidate(
  applicationKey: string,
  source: Application,
  semesterId: string,
  teamId: string,
  official: MainRosterIdentity | null | undefined,
): PraiseRosterCandidate | null {
  const candidate = rosterCandidate(applicationKey, source, semesterId, teamId);
  if (
    !candidate ||
    !official ||
    typeof official !== "object" ||
    typeof official.name !== "string" ||
    !official.name.trim() ||
    !safeFirebaseSegment(source.personId) ||
    !safeFirebaseSegment(official.personId)
  ) return null;
  const applicationPersonId = source.personId.trim();
  const officialPersonId = official.personId.trim();
  if (
    !applicationPersonId ||
    !officialPersonId ||
    !validPersonNamespace(candidate.kind, applicationPersonId) ||
    !validPersonNamespace(candidate.kind, officialPersonId) ||
    applicationPersonId !== officialPersonId
  ) return null;
  const sameName = normalizeName(source.name) === normalizeName(official.name);
  const sameStrongIdentity = applicationPersonId === officialPersonId;
  if (!sameName && !sameStrongIdentity) return null;
  const personId = officialPersonId || applicationPersonId;
  return {
    ...candidate,
    name: official.name.trim(),
    rosterLink: {
      ...candidate.rosterLink,
      ...(personId ? { personId } : {}),
    },
  };
}
function officialPath(candidate: PraiseRosterCandidate, year: string) {
  return candidate.kind === "STAFF"
    ? `${semesterPaths.teacherStaffByYear(year)}/${candidate.rosterLink.staffId}`
    : semesterPaths.classStudent(year, candidate.rosterLink.classKey!, candidate.rosterLink.studentId!);
}

/** 정상 연결은 단건만 조회한다. 이동한 후보가 있을 때만 연도 원장을 한 번 읽어 동일인을 확인한다. */
function officialRosterReader(database: PraiseAdminDatabase, year: string) {
  let movedRoster: Promise<Record<string, { students?: Record<string, MainRosterIdentity> }> | null> | undefined;
  return async (candidate: PraiseRosterCandidate): Promise<MainRosterIdentity | null> => {
    const official = await database.get(officialPath(candidate, year)) as MainRosterIdentity | null;
    if (candidate.kind === 'STAFF' || !candidate.rosterLink.personId
      || official?.personId === candidate.rosterLink.personId) return official;
    movedRoster ??= database.get(semesterPaths.classesByYear(year)) as Promise<Record<string, { students?: Record<string, MainRosterIdentity> }> | null>;
    return uniqueRosterStudent(await movedRoster, candidate.rosterLink.personId);
  };
}
export async function praiseRoster(state: PraiseState) {
  const { semesterId, teamId } = state.meta;
  if (!semesterId || !teamId) return { people: [], semesterHref: null };
  const year = semesterId.match(/^\d{4}/)?.[0];
  if (!year) return { people: [], semesterHref: null };
  let raw: Record<string, Application> | null;
  const database = getPraiseAdmin().database;
  try {
    // 운영 Rules에는 teamId 인덱스가 없다. 해당 학기의 공개 신청만 읽고 아래에서
    // 팀·배치·인물키를 검증한다. 다른 학기와 비공개 신청 정보는 조회하지 않는다.
    raw = await database.get(semesterPaths.applications(semesterId)) as Record<string, Application> | null;
  } catch {
    throw praiseUnavailable("roster_unavailable");
  }
  const preliminary = Object.entries(raw ?? {}).flatMap(([applicationKey, source]) => {
    const candidate = rosterCandidate(applicationKey, source, semesterId, teamId);
    return candidate ? [{ applicationKey, source, candidate }] : [];
  });
  const people: PraiseRosterCandidate[] = [];
  const readOfficial = officialRosterReader(database, year);
  try {
    // 공식 레코드를 제한 병렬로 먼저 확인하고 이동한 학생만 요청 내 공통 원장 조회로 보완한다.
    for (let start = 0; start < preliminary.length; start += 12) {
      const verified = await Promise.all(preliminary.slice(start, start + 12).map(async ({ applicationKey, source, candidate }) => {
        const official = await readOfficial(candidate);
        return verifiedRosterCandidate(applicationKey, source, semesterId, teamId, official);
      }));
      people.push(...verified.filter((candidate): candidate is PraiseRosterCandidate => Boolean(candidate)));
    }
  } catch {
    throw praiseUnavailable("roster_unavailable");
  }
  people.sort((a, b) => a.name.localeCompare(b.name, "ko"));
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
  let official: MainRosterIdentity | null;
  try {
    const database = getPraiseAdmin().database;
    source = await database.get(
          semesterPaths.application(
            semesterId,
            person.rosterLink.applicationKey,
          ),
        ) as Application | null;
    const year = semesterId.match(/^\d{4}/)?.[0] ?? "";
    if (!source || !year) official = null;
    else {
      const preliminary = rosterCandidate(person.rosterLink.applicationKey, source, semesterId, teamId);
      official = preliminary ? await officialRosterReader(database, year)(preliminary) : null;
    }
  } catch {
    throw praiseUnavailable("roster_unavailable");
  }
  const candidate = source
    ? verifiedRosterCandidate(
        person.rosterLink.applicationKey,
        source,
        semesterId,
        teamId,
        official,
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

/** 일괄 이관은 공식 원장을 한 번 읽고 모든 연결을 같은 기준으로 검증한다. */
export async function validatePraiseRosterLinks(
  state: PraiseState,
  people: PraisePersonInput[],
) {
  requireValue(people.length > 0, "대조할 팀원을 선택해 주세요.");
  const roster = await praiseRoster(state);
  const candidates = new Map(roster.people.map((candidate) => [candidate.applicationKey, candidate]));
  for (const person of people) {
    const applicationKey = person.rosterLink?.applicationKey;
    const candidate = applicationKey ? candidates.get(applicationKey) : undefined;
    requireValue(
      candidate &&
        fingerprint(candidate.rosterLink) === fingerprint(person.rosterLink) &&
        candidate.kind === person.kind &&
        candidate.name === person.name &&
        candidate.grade === person.grade &&
        (person.kind === "STAFF" || candidate.department === person.department),
      "대조할 인물의 학기 배치와 기본 정보가 바뀌었습니다. 명단을 새로고침해 다시 확인해 주세요.",
      "roster_changed",
      409,
    );
  }
}
