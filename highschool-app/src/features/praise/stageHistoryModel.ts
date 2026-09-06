import { stageRecordLabel } from "./domain/stage-records";
import type { PraisePerson, PraiseStageVersion } from "./types";

export function comparePraiseStageVersions(a: PraiseStageVersion, b: PraiseStageVersion) { return b.createdAt - a.createdAt || b.number - a.number || b.id.localeCompare(a.id); }

export function preferredPraiseStageVersion(versions: readonly PraiseStageVersion[], worshipDate: string, today: string) {
  return versions.filter((version) => worshipDate >= today || version.kind === "CONFIRMED").sort(comparePraiseStageVersions)[0];
}

/** 저장된 예배일별 최신 확정본을 선택한다. before는 등단 계산의 현재 주일을 제외한다. */
export function latestConfirmedPraiseStages(versions: readonly PraiseStageVersion[], before?: string): PraiseStageVersion[] {
  const bySunday = new Map<string, PraiseStageVersion>();
  for (const version of versions.filter((item) => item.kind === "CONFIRMED" && (!before || item.worshipDate < before))
    .sort(comparePraiseStageVersions)) {
    if (!bySunday.has(version.worshipDate)) bySunday.set(version.worshipDate, version);
  }
  return [...bySunday.values()];
}

export interface PraiseStudentStageRecord {
  label: string;
  staged: boolean;
  storedNames: string[];
}
export interface PraiseStudentStageRow {
  id: string;
  name: string;
  currentName?: string;
  active: boolean | null;
  searchNames: string[];
  records: PraiseStudentStageRecord[];
  stagedCount: number;
}

/** 원시 출석과 현재 활동 상태로 과거를 재계산하지 않는다. 서버가 준 확정본만 사용한다. */
export function praiseStudentStageHistory(people: readonly PraisePerson[], stages: readonly PraiseStageVersion[], range: { from?: string; to?: string } = {}) {
  const versions = latestConfirmedPraiseStages(stages)
    .filter((version) => (!range.from || version.worshipDate >= range.from) && (!range.to || version.worshipDate <= range.to))
    .sort((a, b) => b.worshipDate.localeCompare(a.worshipDate));
  const students = new Map<string, { current?: PraisePerson; names: Set<string>; latestStoredName?: string }>();
  for (const person of people) if (person.kind === "STUDENT") students.set(person.id, { current: person, names: new Set([person.name]) });
  const remember = (id: string, name: string) => {
    const student: { current?: PraisePerson; names: Set<string>; latestStoredName?: string } = students.get(id) ?? { names: new Set<string>() };
    if (name.trim()) { student.names.add(name); student.latestStoredName ??= name; }
    students.set(id, student);
  };
  const recordsByVersion = versions.map((version) => {
    const studentAssignments = version.services.flatMap((service) => service.assignments.filter((assignment) => assignment.personType === "STUDENT")
      .map((assignment) => ({ ...assignment, department: service.department })));
    if (version.config.leaderType === "STUDENT") remember(version.config.leaderId, version.leaderName);
    for (const assignment of studentAssignments) remember(assignment.personId, assignment.name);
    const assignments = new Map<string, { roles: Set<string>; names: Set<string> }>();
    for (const assignment of studentAssignments) {
      const record = assignments.get(assignment.personId) ?? { roles: new Set<string>(), names: new Set<string>() };
      record.roles.add(`${assignment.department === "FIRST" ? "1부" : "2부"} ${assignment.role === "SINGER" ? "싱어" : "콰이어"}`);
      if (assignment.name.trim()) record.names.add(assignment.name);
      assignments.set(assignment.personId, record);
    }
    return { version, assignments, eligible: new Set(version.candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.personId)), excluded: new Set(version.overrides.filter((override) => override.kind === "EXCLUDE_STAGE").map((override) => override.termStudentId)) };
  });
  const rows: PraiseStudentStageRow[] = [...students].map(([id, student]) => {
    const records = recordsByVersion.map(({ version, assignments, eligible, excluded }) => {
      const leader = version.config.leaderType === "STUDENT" && version.config.leaderId === id;
      const assigned = assignments.get(id);
      return {
        label: stageRecordLabel({ confirmed: true, leader, roles: [...assigned?.roles ?? []], eligible: eligible.has(id), excluded: excluded.has(id) }),
        staged: leader || Boolean(assigned?.roles.size),
        storedNames: leader ? [version.leaderName] : [...assigned?.names ?? []],
      };
    });
    return { id, name: student.latestStoredName ?? student.current?.name ?? "보관된 학생", currentName: student.current?.name,
      active: student.current?.active ?? null, searchNames: [...student.names], records,
      stagedCount: records.filter((record) => record.staged).length };
  }).sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
  return { versions, rows };
}
