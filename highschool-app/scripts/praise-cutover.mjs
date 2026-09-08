import { rtdbCanonical } from "./praise-import.mjs";
import {
  canonical,
  migrationFailure,
} from "../src/features/praise/migration/io.mjs";
const fail = (ok, code) => {
  if (!ok) throw migrationFailure(code);
};
const equal = (a, b) =>
  canonical(rtdbCanonical(a) ?? null) === canonical(rtdbCanonical(b) ?? null);
const values = (value) => Object.values(value ?? {});
const normalize = (name) => name.normalize("NFC").replace(/\s/g, "");
/** 동명이인은 부·학년·종류와 공식 인물키로 좁히고, 애매한 대상은 자동 연결하지 않는다. */
export function buildPraiseCutover({
  workspace,
  semester,
  classes,
  staff,
  additions,
  dateAliases,
  attendanceChoices,
  actorUid,
  at,
  readOnlyBefore,
  sourceVerified,
}) {
  fail(
    sourceVerified === true &&
      actorUid &&
      Number.isFinite(at) &&
      /^\d{4}-\d{2}-\d{2}$/.test(readOnlyBefore),
    "cutover_evidence_required",
  );
  fail(
    workspace.meta.mode === "shadow" && workspace.meta.status === "active",
    "shadow_workspace_required",
  );
  const before = structuredClone(workspace),
    next = structuredClone(workspace),
    main = structuredClone(semester);
  const teamId = next.meta.teamId,
    year = next.meta.semesterId?.slice(0, 4);
  fail(main.teams?.[teamId] && year, "semester_team_required");
  const report = {
    people: 0,
    meetings: 0,
    applicationsAdded: 0,
    attendanceAdded: 0,
    attendanceResolved: 0,
    attendanceMatched: 0,
  };
  for (const add of additions) {
    const { key, application } = add;
    fail(!main.applications?.[key], "application_already_exists");
    fail(
      application.teamId === teamId &&
        application.status === "배치" &&
        application.personId &&
        application.studentId &&
        application.name &&
        !application.trainingOnly,
      "invalid_new_application",
    );
    fail(
      application.bu === "스탭" ||
        application.grade === 3 ||
        main.trainingClasses?.[application.trainingClassId],
      "training_class_required",
    );
    (main.applications ??= {})[key] = {
      ...application,
      createdAt: new Date(at).toISOString(),
      createdBy: actorUid,
    };
    report.applicationsAdded++;
  }
  const used = new Set();
  for (const person of values(next.people)) {
    const candidates = Object.entries(main.applications ?? {}).filter(
      ([, a]) =>
        a.teamId === teamId &&
        a.status === "배치" &&
        !a.trainingOnly &&
        normalize(a.name) === normalize(person.name) &&
        ((person.kind === "STAFF" && a.bu === "스탭") ||
          (person.kind === "STUDENT" &&
            a.bu === (person.department === "SECOND" ? "2부" : "1부") &&
            a.grade === person.grade)),
    );
    fail(candidates.length === 1, "ambiguous_roster_match");
    const [key, a] = candidates[0];
    const isStaff = person.kind === "STAFF",
      ck = `${a.bu === "2부" ? 2 : 1}-${a.grade}-${a.class}`;
    const official = isStaff
      ? staff[a.studentId]
      : classes[ck]?.students?.[a.studentId];
    fail(
      official &&
        official.personId &&
        official.personId === a.personId &&
        normalize(official.name) === normalize(a.name) &&
        a.personId.startsWith(isStaff ? "person_staff_" : "person_student_"),
      "official_identity_mismatch",
    );
    fail(
      key === `${isStaff ? "s" : a.bu === "2부" ? "2" : "1"}_${a.studentId}` &&
        !used.has(key),
      "duplicate_roster_link",
    );
    used.add(key);
    fail(
      isStaff || a.grade === 3 || main.trainingClasses?.[a.trainingClassId],
      "existing_training_required",
    );
    person.rosterLink = {
      applicationKey: key,
      personId: a.personId,
      year,
      ...(isStaff
        ? { staffId: a.studentId }
        : { studentId: a.studentId, classKey: ck }),
    };
    person.revision++;
    person.updatedAt = at;
    person.updatedBy = actorUid;
    report.people++;
  }
  const sessionsUsed = new Set();
  for (const m of values(next.meetings)) {
    const originalDate = m.date;
    m.date = dateAliases[m.date] ?? m.date;
    const sessions = Object.entries(main.sessions ?? {}).filter(
      ([, s]) => s.date === m.date,
    );
    fail(sessions.length === 1, "ambiguous_session_match");
    const [key, s] = sessions[0];
    fail(
      !sessionsUsed.has(key) &&
        m.cancelled === (s.type === "휴강" || s.cancelled === true),
      "session_status_mismatch",
    );
    sessionsUsed.add(key);
    fail(
      m.date >= next.meta.startDate && m.date <= next.meta.endDate,
      "session_outside_term",
    );
    m.linkedSessionId = key;
    if (m.date < readOnlyBefore) m.groupVersionId = "import-unresolved";
    else delete m.groupVersionId;
    m.revision++;
    m.updatedAt = at;
    m.updatedBy = actorUid;
    fail(
      next.groupVersions[next.meta.activeGroupVersionId]?.kind === "CONFIRMED",
      "confirmed_groups_required",
    );
    if (originalDate !== m.date) m.sourceDate = originalDate;
    report.meetings++;
    for (const [personId, row] of Object.entries(
      next.attendance?.[m.id] ?? {},
    )) {
      const person = next.people[personId];
      fail(
        person?.kind === "STUDENT" && person.rosterLink?.applicationKey,
        "attendance_identity_missing",
      );
      if (row.status == null) continue;
      fail(
        !m.cancelled && ["PRESENT", "ABSENT"].includes(row.status),
        "invalid_historical_attendance",
      );
      const appKey = person.rosterLink.applicationKey,
        old = main.attendance?.team?.[key]?.[appKey];
      const intended = row.status === "PRESENT" ? "출석" : "결석";
      const existing = old?.s === "지각" ? "출석" : old?.s;
      if (existing === intended) {
        report.attendanceMatched++;
        continue;
      }
      if (old) {
        fail(
          attendanceChoices[`${personId}/${m.id}`] === row.status,
          "attendance_conflict_requires_decision",
        );
        report.attendanceResolved++;
      } else report.attendanceAdded++;
      ((main.attendance ??= {}).team ??= {})[key] ??= {};
      main.attendance.team[key][appKey] = {
        ...old,
        s: intended,
        at: new Date(at).toISOString(),
        by: actorUid,
      };
    }
  }
  const id = `praise_cutover_${at}`;
  // 과거 조와 Storage 확인을 완료했다고 선언하지 않는다. 해당 범위를 기록하고 과거 회차를 보관한다.
  const historyReview = (next.meta.importBlockers ?? []).filter(
    (x) => x !== "source_snapshot_unverified",
  );
  next.meta = {
    ...next.meta,
    mode: "live",
    readOnlyBefore,
    historyReview,
    revision: next.meta.revision + 1,
    updatedAt: at,
    updatedBy: actorUid,
  };
  delete next.meta.importBlockers;
  next.audit ??= {};
  next.audit[id] = {
    id,
    at,
    actor: { uid: actorUid },
    action: "migration.cutover",
    label: "찬양팀 통합 원장 연결·운영 전환",
    changes: [
      {
        field: "명단 연결",
        before: "미연결",
        after: `${report.people}명 공식 인물키 연결`,
      },
      { field: "모임 연결", after: `${report.meetings}회차` },
      { field: "학기 배치 추가", after: `${report.applicationsAdded}명` },
      {
        field: "과거 출결",
        after: `추가 ${report.attendanceAdded}건 · 사용자 확인 정정 ${report.attendanceResolved}건`,
      },
      { field: "운영 입력 시작", after: readOnlyBefore },
      { field: "과거 자료 확인", after: historyReview.join(", ") },
    ],
  };
  main.praiseCutovers ??= {};
  main.praiseCutovers[id] = {
    at,
    by: actorUid,
    workspaceId: next.meta.id,
    report,
  };
  return {
    before,
    after: next,
    semesterBefore: semester,
    semesterAfter: main,
    report,
    id,
  };
}
/** 사전 스냅샷과 다르면 중단한다. 네트워크 재시도는 이미 적용된 값만 성공으로 판정한다. */
export function guardedCutoverValue(current, before, after) {
  if (equal(current, after)) return current;
  fail(equal(current, before), "cutover_concurrent_change");
  return structuredClone(after);
}
