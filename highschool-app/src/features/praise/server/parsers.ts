import type { GroupingRule, GroupingSettings } from "../domain/grouping";
import { stageOverrideSchema } from "../domain/stage-schema";
import type {
  PraiseCommand,
  PraiseCreateRequest,
  PraiseGroupInput,
  PraiseMeetingInput,
  PraisePersonInput,
  PraiseStageConfig,
  PraiseStageInput,
} from "../types";
import type { PraiseMeetingGuide } from "../content/types";
import {
  bool,
  choice,
  date,
  id,
  ids,
  integer,
  list,
  object,
  requireValue,
  text,
} from "./validation";

function operationKey(value: unknown): string {
  const key = id(value, "작업 번호");
  requireValue(key.length <= 126, "작업 번호는 126자 이내로 입력해 주세요.");
  return key;
}
const optionalId = (value: unknown) =>
  value === undefined || value === "" || value === null ? undefined : id(value);
export function parsePerson(value: unknown): PraisePersonInput {
  const p = object(value);
  const kind = choice(p.kind, ["STUDENT", "STAFF"] as const, "인원 구분");
  const link = p.rosterLink ? object(p.rosterLink) : null;
  return {
    id: id(p.id),
    kind,
    name: text(p.name, "이름", 80),
    grade: integer(p.grade, kind === "STUDENT" ? 1 : 0, 3, "학년"),
    gender: choice(
      p.gender,
      ["FEMALE", "MALE", "UNSPECIFIED"] as const,
      "성별",
    ),
    department: choice(p.department, ["FIRST", "SECOND"] as const, "예배 부서"),
    team: choice(p.team, ["SINGER", "SESSION"] as const, "싱어·세션"),
    active: bool(p.active, "활동 여부"),
    isStudentLeader: bool(p.isStudentLeader, "학생 인도자"),
    singerCapable: bool(p.singerCapable, "싱어 가능 여부"),
    groupStaffCapable: bool(p.groupStaffCapable, "조 담당 가능 여부"),
    preferredService: choice(
      p.preferredService,
      ["FIRST", "SECOND", "BOTH"] as const,
      "선호 예배",
    ),
    excludeFromAutoSinger: bool(p.excludeFromAutoSinger, "자동 등단 제외"),
    ...(optionalId(p.sourceId) ? { sourceId: optionalId(p.sourceId) } : {}),
    ...(link
      ? {
          rosterLink: Object.fromEntries(
            [
              "personId",
              "year",
              "classKey",
              "studentId",
              "staffId",
              "applicationKey",
            ].flatMap((key) =>
              optionalId(link[key]) ? [[key, optionalId(link[key])]] : [],
            ),
          ),
        }
      : {}),
  };
}
export function parseMeeting(value: unknown): PraiseMeetingInput {
  const p = object(value);
  return {
    id: id(p.id),
    title: text(p.title, "모임 이름", 120),
    date: date(p.date),
    worshipDate: date(p.worshipDate, "예배 날짜"),
    sequence: integer(p.sequence, 1, 100, "회차"),
    cancelled: bool(p.cancelled, "휴강 여부"),
    temporary: bool(p.temporary, "임시 모임 여부"),
    ...(optionalId(p.linkedSessionId)
      ? { linkedSessionId: optionalId(p.linkedSessionId) }
      : {}),
    ...(optionalId(p.groupVersionId)
      ? { groupVersionId: optionalId(p.groupVersionId) }
      : {}),
  };
}
export function parseGrouping(value: unknown): GroupingSettings {
  const p = object(value);
  const result = {
    groupCount: integer(p.groupCount, 1, 50, "조 수"),
    studentMin: integer(p.studentMin, 0, 100, "학생 최소 인원"),
    studentMax: integer(p.studentMax, 1, 100, "학생 최대 인원"),
    staffMin: integer(p.staffMin, 0, 20, "스탭 최소 인원"),
    staffMax: integer(p.staffMax, 0, 20, "스탭 최대 인원"),
    clusterGender: bool(p.clusterGender, "성별 조건"),
    clusterGrade: bool(p.clusterGrade, "학년 조건"),
    splitTeam: bool(p.splitTeam, "싱어·세션 분리"),
  };
  requireValue(
    result.studentMin <= result.studentMax &&
      result.staffMin <= result.staffMax,
    "최소 인원은 최대 인원보다 클 수 없습니다.",
  );
  return result;
}
export function parseRules(value: unknown): GroupingRule[] {
  return list(value, 200, (item) => {
    const p = object(item);
    const type = choice(
      p.type,
      [
        "TOGETHER",
        "APART",
        "TOP_SEED",
        "GENDER_MIN",
        "GRADE_MIN",
        "TEAM_MIN",
      ] as const,
      "조 조건 종류",
    );
    return {
      id: id(p.id),
      type,
      memberIds: ids(p.memberIds),
      ...(type.endsWith("_MIN")
        ? {
            value: text(p.value, "조건값", 30),
            minCount: integer(p.minCount, 0, 100, "조건 최소 인원"),
          }
        : {}),
    };
  });
}
function parseStageSettings(value: unknown) {
  const p = object(value);
  const target = (v: unknown) => {
    const row = object(v);
    return {
      singerTarget: integer(row.singerTarget, 0, 50, "싱어 목표"),
      choirTarget: integer(row.choirTarget, 0, 100, "콰이어 목표"),
    };
  };
  requireValue(
    typeof p.studentRatio === "number" &&
      Number.isFinite(p.studentRatio) &&
      p.studentRatio >= 0.7 &&
      p.studentRatio <= 0.8,
    "학생 등단 비율은 70~80%로 입력해 주세요.",
  );
  return {
    first: target(p.first),
    second: target(p.second),
    studentRatio: p.studentRatio,
    minimumFemaleSingers: integer(
      p.minimumFemaleSingers,
      0,
      50,
      "권장 여자 싱어 수",
    ),
  };
}
export function parseStageConfig(value: unknown): PraiseStageConfig {
  const p = object(value);
  return {
    ...parseStageSettings(p),
    leaderId: id(p.leaderId, "인도자"),
    leaderType: choice(
      p.leaderType,
      ["STUDENT", "STAFF"] as const,
      "인도자 구분",
    ),
    staffOnly: bool(p.staffOnly, "스탭만 등단 여부"),
  };
}
export function parseOverrides(value: unknown) {
  return list(value, 300, (item) => {
    const result = stageOverrideSchema.safeParse(item);
    requireValue(result.success, "등단 특이사항을 확인해 주세요.");
    return result.data;
  });
}
export function parseGroupDraft(value: unknown): PraiseGroupInput {
  const p = object(value);
  return {
    settings: parseGrouping(p.settings),
    rules: parseRules(p.rules),
    seed: integer(p.seed, 0, 2147483647, "편성 기준 번호"),
    groups: list(p.groups, 50, (item) => {
      const g = object(item);
      return {
        id: id(g.id),
        name: text(g.name, "조 이름", 60),
        studentIds: ids(g.studentIds),
        staffIds: ids(g.staffIds, 100),
      };
    }),
  };
}
export function parseStageDraft(value: unknown): PraiseStageInput {
  const p = object(value);
  return {
    config: parseStageConfig(p.config),
    overrides: parseOverrides(p.overrides),
    services: list(p.services, 2, (item) => {
      const service = object(item);
      return {
        department: choice(
          service.department,
          ["FIRST", "SECOND"] as const,
          "예배 부",
        ),
        assignments: list(service.assignments, 200, (item) => {
          const a = object(item);
          return {
            personId: id(a.personId),
            personType: choice(
              a.personType,
              ["STUDENT", "STAFF"] as const,
              "등단 인원 구분",
            ),
            name: text(a.name, "이름", 80),
            gender: choice(
              a.gender,
              ["FEMALE", "MALE", "UNSPECIFIED"] as const,
              "성별",
            ),
            role: choice(a.role, ["SINGER", "CHOIR"] as const, "포지션"),
            side: choice(a.side, ["LEFT", "RIGHT"] as const, "배치 위치"),
            positionOrder: integer(a.positionOrder, 0, 200, "배치 순서"),
            reason: text(a.reason, "배정 이유", 300, true),
            isManual: true,
          };
        }),
      };
    }),
  };
}
export function parseGuide(value: unknown): PraiseMeetingGuide {
  const p = object(value);
  const lines = (v: unknown) =>
    list(v, 100, (line) => text(line, "안내 내용", 2000));
  return {
    title: text(p.title, "가이드 제목", 120),
    description: text(p.description, "가이드 설명", 2000, true),
    durationMinutes: integer(p.durationMinutes, 0, 600, "진행 시간"),
    location: text(p.location, "장소", 200, true),
    interviewLocation: text(p.interviewLocation, "면접 장소", 200, true),
    preparation: lines(p.preparation),
    interviewGuidelines: lines(p.interviewGuidelines),
    fallbacks: lines(p.fallbacks),
    roles: list(p.roles, 30, (item) => {
      const r = object(item);
      return {
        id: id(r.id),
        title: text(r.title, "역할", 100),
        responsibilities: lines(r.responsibilities),
      };
    }),
    steps: list(p.steps, 50, (item) => {
      const r = object(item);
      return {
        id: id(r.id),
        title: text(r.title, "순서", 120),
        durationMinutes: integer(r.durationMinutes, 0, 600, "소요 시간"),
        instructions: lines(r.instructions),
      };
    }),
  };
}
export function parseCreate(value: unknown): PraiseCreateRequest {
  const row = object(value),
    p = object(row.workspace);
  const startDate = date(p.startDate),
    endDate = date(p.endDate);
  requireValue(
    startDate <= endDate &&
      Date.parse(endDate) - Date.parse(startDate) <= 370 * 86400000,
    "학기 기간은 시작일부터 1년 이내로 정해 주세요.",
  );
  return {
    operationId: operationKey(row.operationId),
    workspace: {
      id: id(p.id),
      name: text(p.name, "운영 이름", 120),
      startDate,
      endDate,
      ...(optionalId(p.semesterId)
        ? { semesterId: optionalId(p.semesterId) }
        : {}),
      ...(optionalId(p.teamId) ? { teamId: optionalId(p.teamId) } : {}),
    },
  };
}
export function parseCommand(value: unknown): {
  operationId: string;
  command: PraiseCommand;
} {
  const row = object(value),
    p = object(row.command),
    operationId = operationKey(row.operationId);
  const type = text(p.type, "작업 종류", 50);
  const expected = () =>
    integer(p.expectedRevision, 0, Number.MAX_SAFE_INTEGER, "기록 버전");
  const meetingId = () => id(p.meetingId);
  const inputRevision = () => text(p.inputRevision, "기준 버전", 128);
  let command: PraiseCommand;
  switch (type) {
    case "meta.save": {
      const m = object(p.meta);
      const startDate = date(m.startDate),
        endDate = date(m.endDate);
      requireValue(
        startDate <= endDate &&
          Date.parse(endDate) - Date.parse(startDate) <= 370 * 86400000,
        "학기 기간을 확인해 주세요.",
      );
      command = {
        type,
        expectedRevision: expected(),
        meta: {
          name: text(m.name, "운영 이름", 120),
          startDate,
          endDate,
          status: choice(
            m.status,
            ["active", "archived"] as const,
            "운영 상태",
          ),
          mode: choice(
            m.mode,
            ["setup", "shadow", "live"] as const,
            "입력 모드",
          ),
          ...(optionalId(m.semesterId)
            ? { semesterId: optionalId(m.semesterId) }
            : {}),
          ...(optionalId(m.teamId) ? { teamId: optionalId(m.teamId) } : {}),
        },
      };
      break;
    }
    case "person.save":
      command = {
        type,
        expectedRevision: expected(),
        person: parsePerson(p.person),
      };
      break;
    case "meeting.save":
      command = {
        type,
        expectedRevision: expected(),
        meeting: parseMeeting(p.meeting),
      };
      break;
    case "groups.generate":
      command = {
        type,
        expectedRevision: expected(),
        settings: parseGrouping(p.settings),
        rules: parseRules(p.rules),
        seed: integer(p.seed, 0, 2147483647, "편성 기준 번호"),
      };
      break;
    case "groups.save":
    case "groups.confirm":
      command = {
        type,
        expectedRevision: expected(),
        sourceVersionId: id(p.sourceVersionId),
        draft: parseGroupDraft(p.draft),
        acknowledgeWarnings: bool(p.acknowledgeWarnings, "경고 확인"),
      };
      break;
    case "attendance.resolve":
      requireValue(p.acknowledge === true, "현재 공통 출석을 검토한 뒤 확인해 주세요.");
      requireValue(typeof p.expectedSourceRevision === "string" && /^[a-f0-9]{64}$/.test(p.expectedSourceRevision), "공통 출석 버전을 확인해 주세요.");
      command = { type, pendingOperationId: operationKey(p.pendingOperationId), resolution: choice(p.resolution, ["finalize", "close"] as const, "검토 처리"), expectedSourceRevision: p.expectedSourceRevision, acknowledge: true };
      break;
    case "attendance.set":
      if (p.expectedSourceRevision !== undefined)
        requireValue(typeof p.expectedSourceRevision === "string" && /^[a-f0-9]{64}$/.test(p.expectedSourceRevision), "공통 출석 버전을 확인해 주세요.");
      command = {
        type,
        ...(p.expectedSourceRevision !== undefined ? { expectedSourceRevision: p.expectedSourceRevision as string } : {}),
        meetingId: meetingId(),
        personId: id(p.personId),
        status:
          p.status === null
            ? null
            : choice(p.status, ["PRESENT", "ABSENT"] as const, "출결"),
        expectedRevision: expected(),
      };
      break;
    case "availability.set":
      command = {
        type,
        meetingId: meetingId(),
        personId: id(p.personId),
        present: p.present === null ? null : bool(p.present, "참석 여부"),
        role: choice(p.role, ["SINGER", "SESSION"] as const, "스탭 역할"),
        expectedRevision: expected(),
      };
      break;
    case "stage.generate":
      command = {
        type,
        meetingId: meetingId(),
        inputRevision: inputRevision(),
        config: parseStageConfig(p.config),
        overrides: parseOverrides(p.overrides),
      };
      break;
    case "stage.save":
    case "stage.confirm":
      command = {
        type,
        meetingId: meetingId(),
        inputRevision: inputRevision(),
        sourceVersionId: id(p.sourceVersionId),
        draft: parseStageDraft(p.draft),
        acknowledgeWarnings: bool(p.acknowledgeWarnings, "경고 확인"),
      };
      break;
    case "policy.save": {
      const policy = object(p.policy);
      command = {
        type,
        expectedRevision: expected(),
        policy: {
          grouping: parseGrouping(policy.grouping),
          rules: parseRules(policy.rules),
          stage: parseStageSettings(policy.stage),
        },
      };
      break;
    }
    case "access.save": {
      const a = object(p.access);
      command = {
        type,
        expectedRevision: expected(),
        access: {
          uid: id(a.uid, "로그인 계정 UID"),
          staffId: id(a.staffId, "스탭"),
          role: choice(
            a.role,
            ["manager", "editor", "groupStaff", "member"] as const,
            "권한",
          ),
          active: bool(a.active, "계정 사용 여부"),
        },
      };
      break;
    }
    case "guide.save": {
      const g = object(p.guide);
      command = {
        type,
        expectedRevision: expected(),
        guide: {
          meetingId: id(g.meetingId),
          published: bool(g.published, "가이드 게시 여부"),
          content: parseGuide(g.content),
        },
      };
      break;
    }
    case "people.import":
      command = {
        type,
        people: list(p.people, 1000, parsePerson),
        checksum: text(p.checksum, "가져오기 확인값", 128),
        source: text(p.source, "원본 형식", 80),
      };
      break;
    default:
      requireValue(false, "지원하지 않는 찬양팀 작업입니다.");
  }
  return { operationId, command };
}
