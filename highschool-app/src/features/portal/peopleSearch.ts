import { parseClassKey } from "@/lib/classKey";
import { normalizeName, stripSuffix } from "@/lib/studentMatcher";
import { isStaffAppKey } from "@/features/semester/applicant";

export type PersonField = { label: string; value: string; sensitive?: boolean };
export type PersonKind = "student" | "teacher" | "staff" | "other";

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  student: "학생",
  teacher: "교사",
  staff: "스탭",
  other: "기타",
};

export type PersonRecord = {
  id: string;
  category: "학적·출석" | "학기 중 사역" | "새친구" | "수련회";
  period: string;
  title: string;
  fields: PersonField[];
  sortKey: string;
  private?: boolean;
};

export type PersonYearGroup = {
  year: string;
  label: string;
  records: PersonRecord[];
};

export function personRecordYear(record: PersonRecord): string {
  for (const value of [record.period, record.sortKey]) {
    const match = value.match(/(?:19|20)\d{2}/);
    if (match) return match[0];
  }
  return "unknown";
}

export function groupPersonRecordsByYear(records: PersonRecord[]): PersonYearGroup[] {
  const grouped = new Map<string, PersonRecord[]>();
  records.forEach((record) => {
    const year = personRecordYear(record);
    grouped.set(year, [...(grouped.get(year) ?? []), record]);
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return Number(b) - Number(a);
    })
    .map(([year, yearRecords]) => ({
      year,
      label: year === "unknown" ? "연도 미상" : `${year}년`,
      records: yearRecords,
    }));
}

function recordFieldValue(record: PersonRecord, label: string) {
  return record.fields.find((item) => item.label === label)?.value ?? "";
}

function recordDateValue(value: string) {
  const iso = Date.parse(value);
  if (Number.isFinite(iso)) return iso;
  const match = value.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*(오전|오후)?\s*(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
  if (!match) return 0;
  let hour = Number(match[5]) || 0;
  if (match[4] === "오후" && hour < 12) hour += 12;
  if (match[4] === "오전" && hour === 12) hour = 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, Number(match[6]) || 0, Number(match[7]) || 0).getTime();
}

function retreatRecordPriority(record: PersonRecord) {
  const status = recordFieldValue(record, "신청 상태");
  const statusRank = ({ 신청취소: 4, 부분참: 3, 입금완료: 2, 신청: 1 } as Record<string, number>)[status] ?? 0;
  return [recordDateValue(recordFieldValue(record, "신청일")), statusRank, record.fields.length] as const;
}

function compareRetreatRecords(a: PersonRecord, b: PersonRecord) {
  const left = retreatRecordPriority(a);
  const right = retreatRecordPriority(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return b.id.localeCompare(a.id);
}

/** 같은 사람 프로필 안에서 같은 수련회의 참가자 중복 행만 하나의 신청·배정 카드로 합친다. */
export function consolidatePersonRecords(records: PersonRecord[]): PersonRecord[] {
  const participantGroups = new Map<string, PersonRecord[]>();
  const untouched: PersonRecord[] = [];
  for (const record of records) {
    const markerIndex = record.id.indexOf(":participant:");
    if (!record.id.startsWith("retreat:") || markerIndex < 0 || record.title !== "수련회 신청·배정") {
      untouched.push(record);
      continue;
    }
    const retreatKey = record.id.slice(0, markerIndex);
    participantGroups.set(retreatKey, [...(participantGroups.get(retreatKey) ?? []), record]);
  }

  const consolidated = [...participantGroups.values()].map((group) => {
    const [primary, ...secondary] = [...group].sort(compareRetreatRecords);
    const mergedFields = [...primary.fields];
    for (const record of secondary) {
      for (const item of record.fields) {
        if (!mergedFields.some((current) => current.label === item.label)) mergedFields.push(item);
      }
    }
    return { ...primary, fields: mergedFields, private: group.some((record) => record.private) || undefined };
  });
  return [...untouched, ...consolidated];
}

export type PersonProfile = {
  id: string;
  name: string;
  aliases: string[];
  kinds: PersonKind[];
  records: PersonRecord[];
  years: string[];
  latestClass?: string;
  ambiguous: boolean;
};

export type PeopleSearchData = {
  classes: Record<string, unknown>;
  attendance: Record<string, unknown>;
  retreats: Record<string, unknown>;
  semesters: Record<string, unknown>;
  retreatsPrivate: Record<string, unknown>;
  semestersPrivate: Record<string, unknown>;
  teacherStaff?: Record<string, unknown>;
  teacherSpecial?: Record<string, unknown>;
  teacherExtra?: Record<string, unknown>;
  teacherAdditional?: Record<string, unknown>;
};

type Evidence = {
  name: string;
  normalizedName: string;
  kind: PersonKind;
  personIds: Set<string>;
  sourceIds: Set<string>;
  births: Set<string>;
  phones: Set<string>;
  parentPhones: Set<string>;
  progressionIds: Set<string>;
  year: string;
  contextKey: string;
  anchor: boolean;
  studentBu: number;
  studentGrade: number;
  record: PersonRecord;
};

type MutableProfile = {
  evidence: Evidence[];
  personIds: Set<string>;
  sourceIds: Set<string>;
  births: Set<string>;
  phones: Set<string>;
  parentPhones: Set<string>;
  progressionIds: Set<string>;
  years: Set<string>;
  kinds: Set<PersonKind>;
  contexts: Set<string>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const digits = (value: unknown) => text(value).replace(/\D/g, "");
const compactBirth = (value: unknown) => text(value).replace(/\D/g, "");
const cleanDisplayName = (value: unknown) => text(value).replace(/^\d+\s*/, "").trim();

function field(label: string, value: unknown, sensitive = false): PersonField | null {
  const rendered = text(value);
  return rendered ? { label, value: rendered, ...(sensitive ? { sensitive: true } : {}) } : null;
}

function fields(...values: Array<PersonField | null>): PersonField[] {
  return values.filter((value): value is PersonField => value !== null);
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(asRecord(value))
      .map(([key, item]) => `${key}: ${text(item) || JSON.stringify(item)}`)
      .join(" · ");
  }
  return text(value);
}

function addExtraFields(target: PersonField[], source: Record<string, unknown>, labels: Record<string, string>, sensitive = false) {
  for (const [key, label] of Object.entries(labels)) {
    const value = displayValue(source[key]);
    if (value && !target.some((item) => item.label === label)) target.push({ label, value, ...(sensitive ? { sensitive: true } : {}) });
  }
}

function identityValues(input: { kind: PersonKind; personId?: unknown; sourceId?: unknown; birth?: unknown; phone?: unknown; parentPhone?: unknown; pPhone?: unknown }) {
  const personIds = new Set<string>();
  const sourceIds = new Set<string>();
  const births = new Set<string>();
  const phones = new Set<string>();
  const parentPhones = new Set<string>();
  const personId = text(input.personId);
  if (personId.startsWith(`person_${input.kind}_`)) personIds.add(personId);
  const sourceId = text(input.sourceId);
  if (sourceId) sourceIds.add(`${input.kind}-source:${sourceId}`);
  const birth = compactBirth(input.birth);
  if (birth.length >= 6) births.add(birth);
  const ownPhone = digits(input.phone);
  if (ownPhone.length >= 8) phones.add(ownPhone);
  for (const raw of [input.parentPhone, input.pPhone]) {
    const phone = digits(raw);
    if (phone.length >= 8) parentPhones.add(phone);
  }
  return { personIds, sourceIds, births, phones, parentPhones };
}

function kindForAffiliation(value: unknown, fallback: PersonKind = "student"): PersonKind {
  const affiliation = text(value);
  if (affiliation.includes("스탭")) return "staff";
  if (affiliation.includes("교사") || affiliation.includes("교역자")) return "teacher";
  return fallback;
}

function evidence(input: {
  name: unknown;
  personId?: unknown;
  sourceId?: unknown;
  birth?: unknown;
  phone?: unknown;
  parentPhone?: unknown;
  pPhone?: unknown;
  kind?: PersonKind;
  year?: unknown;
  bu?: unknown;
  grade?: unknown;
  contextKey: string;
  anchor?: boolean;
  record: PersonRecord;
}): Evidence | null {
  const name = text(input.name);
  const normalizedName = stripSuffix(normalizeName(name));
  if (normalizedName.length < 2) return null;
  const kind = input.kind ?? "other";
  const identity = identityValues({ ...input, kind });
  return {
    name,
    normalizedName,
    kind,
    ...identity,
    progressionIds: new Set<string>(),
    year: text(input.year),
    contextKey: input.contextKey,
    anchor: input.anchor ?? false,
    studentBu: Number(input.bu) || 0,
    studentGrade: Number(input.grade) || 0,
    record: input.record,
  };
}

function attendanceCounts(value: unknown) {
  const counts = { O: 0, X: 0 };
  function walk(current: unknown) {
    if (current === "O" || current === "T") counts.O += 1;
    else if (current === "X") counts.X += 1;
    else if (current && typeof current === "object") Object.values(current).forEach(walk);
  }
  walk(value);
  return counts;
}

function rosterStatus(color: unknown) {
  return ({ blue: "입금완료", orange: "부분참", red: "신청취소", green: "신청", purple: "신청" } as Record<string, string>)[text(color)] ?? "";
}

function studentKeys(studentId: unknown, bu: unknown, fallback?: string) {
  const values = new Set<string>();
  if (fallback) values.add(fallback);
  const id = text(studentId);
  if (!id) return values;
  values.add(id);
  if (/^[12]_/.test(id)) values.add(id);
  else {
    const buNum = text(bu).includes("1") ? "1" : text(bu).includes("2") ? "2" : "";
    if (buNum) values.add(`${buNum}_${id}`);
  }
  return values;
}

function sourceIdFor(kind: PersonKind, year: unknown, rawId: unknown, bu?: unknown) {
  const id = text(rawId);
  if (!id) return "";
  const period = text(year);
  if (kind !== "student") return `${period}:${id}`;
  if (/^[12]_/.test(id)) return `${period}:${id}`;
  const buNum = text(bu).includes("1") ? "1" : text(bu).includes("2") ? "2" : "";
  return `${period}:${buNum ? `${buNum}_` : ""}${id}`;
}

function yearFrom(...values: unknown[]) {
  for (const value of values) {
    const match = text(value).match(/(?:19|20)\d{2}/);
    if (match) return match[0];
  }
  return "";
}

function findAssignment(source: unknown, keys: Set<string>) {
  for (const [id, value] of Object.entries(asRecord(source))) {
    const ids = Array.isArray(asRecord(value).studentIds) ? asRecord(value).studentIds as unknown[] : [];
    if (ids.some((item) => keys.has(text(item)))) return { id, value: asRecord(value) };
  }
  return null;
}

function buildClassEvidence(data: PeopleSearchData, output: Evidence[]) {
  for (const [year, yearValue] of Object.entries(asRecord(data.classes))) {
    for (const [classKey, classValue] of Object.entries(asRecord(yearValue))) {
      const classData = asRecord(classValue);
      const parsed = parseClassKey(classKey);
      for (const [studentId, studentValue] of Object.entries(asRecord(classData.students))) {
        const student = asRecord(studentValue);
        const name = text(student.name);
        if (!name) continue;
        const counts = attendanceCounts(asRecord(asRecord(asRecord(data.attendance)[year])[classKey])[studentId]);
        const history = fields(
          field("부서", parsed ? `${parsed.buNum}부` : ""),
          field("학년·반", parsed ? `${parsed.grade}학년 ${parsed.classNum}반` : classKey),
          field("번호", student.num), field("담임", classData.teacher), field("학교", student.school),
          field("생년월일", student.birth, true), field("학생 연락처", student.phone, true),
          field("보호자 연락처", student.pphone, true), field("주소", student.addr, true),
          field("장기결석", student.jang === true ? "예" : student.jang === false ? "아니오" : ""),
          field("주일 출석", counts.O + counts.X > 0 ? `출석 ${counts.O} · 결석 ${counts.X}` : "기록 없음"),
        );
        const item = evidence({
          name, personId: student.personId, sourceId: sourceIdFor("student", year, studentId, parsed?.buNum), birth: student.birth,
          phone: student.phone, pPhone: student.pphone ?? student.pPhone, kind: "student", year,
          bu: parsed?.buNum, grade: parsed?.grade, contextKey: `class:${year}`, anchor: true,
          record: {
            id: `class:${year}:${classKey}:${studentId}`, category: "학적·출석", period: `${year}년`,
            title: parsed ? `${parsed.grade}학년 ${parsed.classNum}반` : classKey, fields: history, sortKey: `${year}-4`,
          },
        });
        if (item) output.push(item);
      }
    }
  }
}

function buildRosterRootEvidence(input: {
  root: unknown;
  rootName: string;
  kind: "teacher" | "staff";
  fallbackTitle: string;
}, output: Evidence[]) {
  function walk(value: unknown, segments: string[]) {
    if (!value || typeof value !== "object") return;
    const entry = asRecord(value);
    if (text(entry.name)) {
      const year = segments[0] ?? "";
      const part = segments[1] === "1" || segments[1] === "2" ? `${segments[1]}부` : input.kind === "staff" ? "스탭" : "";
      const title = text(entry.title) || input.fallbackTitle;
      const item = evidence({
        name: entry.name,
        personId: entry.personId,
        sourceId: sourceIdFor(input.kind, year, `${input.rootName}:${segments.slice(1).join(":")}`),
        birth: entry.birth,
        phone: entry.phone,
        kind: input.kind,
        year,
        contextKey: `roster:${input.rootName}:${year}`,
        anchor: true,
        record: {
          id: `roster:${input.rootName}:${segments.join(":")}`,
          category: "학적·출석",
          period: `${year}년`,
          title: `${title} · ${input.kind === "staff" ? "스탭" : "교사"} 명단`,
          fields: fields(
            field("소속", part),
            field("직책", title),
            field("생년월일", entry.birth, true),
            field("연락처", entry.phone, true),
          ),
          sortKey: `${year}-4`,
        },
      });
      if (item) output.push(item);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, [...segments, key]);
  }
  walk(input.root, []);
}

function buildTeacherRosterEvidence(data: PeopleSearchData, output: Evidence[]) {
  buildRosterRootEvidence({ root: data.teacherStaff, rootName: "teacherStaff", kind: "staff", fallbackTitle: "스탭" }, output);
  buildRosterRootEvidence({ root: data.teacherSpecial, rootName: "teacherSpecial", kind: "teacher", fallbackTitle: "비반담임" }, output);
  buildRosterRootEvidence({ root: data.teacherExtra, rootName: "teacherExtra", kind: "teacher", fallbackTitle: "담임 교사" }, output);
  buildRosterRootEvidence({ root: data.teacherAdditional, rootName: "teacherAdditional", kind: "teacher", fallbackTitle: "추가 교사" }, output);
}

function buildSemesterEvidence(data: PeopleSearchData, output: Evidence[]) {
  for (const [sid, rawValue] of Object.entries(asRecord(data.semesters))) {
    const semester = asRecord(rawValue);
    const meta = asRecord(semester.meta);
    const year = yearFrom(meta.title, sid);
    const teams = asRecord(semester.teams);
    const training = asRecord(semester.trainingClasses);
    const applicationsPrivate = asRecord(asRecord(asRecord(data.semestersPrivate)[sid]).applicationsPrivate);
    for (const [appKey, rawApp] of Object.entries(asRecord(semester.applications))) {
      const app = asRecord(rawApp);
      const priv = asRecord(applicationsPrivate[appKey]);
      const attendance = { 출석: 0, 지각: 0, 결석: 0 };
      for (const session of Object.values(asRecord(asRecord(semester.attendance).team))) {
        const status = text(asRecord(asRecord(session)[appKey]).s) as keyof typeof attendance;
        if (status in attendance) attendance[status] += 1;
      }
      const teamName = text(asRecord(teams[text(app.teamId)]).name);
      const trainingName = text(asRecord(training[text(app.trainingClassId)]).name);
      const choice = [app.choice1, app.choice2].map((id) => text(asRecord(teams[text(id)]).name)).filter(Boolean).join(" → ");
      const completion = asRecord(asRecord(semester.completion)[appKey]);
      const recordFields = fields(
        field("신청 상태", app.status), field("부서", app.bu), field("학년·반", `${text(app.grade)}학년 ${text(app.class)}반`),
        field("훈련", trainingName), field("사역팀", teamName), field("지원 순위", choice),
        field("훈련만 신청", app.trainingOnly === true ? "예" : ""),
        field("사역 출석", Object.values(attendance).some(Boolean) ? `출석 ${attendance.출석} · 지각 ${attendance.지각} · 결석 ${attendance.결석}` : "기록 없음"),
        field("수료증", completion.certPrinted === true ? "제작 완료" : ""), field("사진 확인", completion.photoChecked === true ? "완료" : ""),
        field("수료 메모", completion.note), field("학생 연락처", priv.phone, true), field("보호자 연락처", priv.parentPhone, true),
        field("지원 동기", priv.motive, true), field("하고 싶은 활동", priv.wish, true), field("행정 메모", priv.memo, true),
      );
      const kind = isStaffAppKey(appKey) ? "staff" : kindForAffiliation(app.bu);
      const item = evidence({
        name: app.name, personId: app.personId, sourceId: sourceIdFor(kind, year, app.studentId, app.bu), phone: priv.phone, parentPhone: priv.parentPhone,
        kind, year, contextKey: `semester:${sid}`, anchor: true,
        record: { id: `semester:${sid}:${appKey}`, category: "학기 중 사역", period: text(meta.title) || sid,
          title: [trainingName, teamName].filter(Boolean).join(" · ") || "사역 신청", fields: recordFields, sortKey: `${sid}-3`, private: Object.keys(priv).length > 0 },
      });
      if (item) output.push(item);
    }

    const newFriendsPrivate = asRecord(asRecord(asRecord(data.semestersPrivate)[sid]).newFriendsPrivate);
    for (const [friendId, rawFriend] of Object.entries(asRecord(semester.newFriends))) {
      const friend = asRecord(rawFriend);
      const priv = asRecord(newFriendsPrivate[friendId]);
      const recordFields = fields(
        field("진행 상태", friend.decision), field("부서", friend.part), field("학년", `${text(friend.grade)}학년`),
        field("학교", friend.school), field("담당 바나바", friend.owner), field("인도자", friend.inviter),
        field("1주차", friend.week1Date), field("2주차", friend.week2Date), field("신앙 단계", friend.faithStep),
        field("배정 반", friend.assignedClassKey),
        field("생년월일", priv.birth, true), field("학생 연락처", priv.phone, true), field("보호자 연락처", priv.parentPhone, true),
        field("주소", priv.address, true), field("교회 친구", priv.churchFriend, true), field("바나바 메모", priv.teamMemo, true),
        field("가족 사항", priv.familyNotes, true), field("목양 메모", priv.pastoralNotes, true),
      );
      const rosterSync = asRecord(friend.rosterSync);
      const item = evidence({
        name: friend.name, personId: rosterSync.personId ?? friend.personId, sourceId: sourceIdFor("student", year, rosterSync.studentId, friend.part), birth: priv.birth, phone: priv.phone, parentPhone: priv.parentPhone,
        kind: "student", year, contextKey: `newfriend:${sid}`, anchor: true,
        record: { id: `newfriend:${sid}:${friendId}`, category: "새친구", period: text(meta.title) || sid,
          title: `새친구 ${text(friend.decision) || "접수"}`, fields: recordFields, sortKey: `${sid}-5`, private: Object.keys(priv).length > 0 },
      });
      if (item) output.push(item);
    }
  }
}

function retreatMeta(retreatId: string, retreat: Record<string, unknown>) {
  return { period: text(retreat.name) || retreatId, year: text(retreat.year) || "0000" };
}

function buildRetreatEvidence(data: PeopleSearchData, output: Evidence[]) {
  for (const [retreatId, rawValue] of Object.entries(asRecord(data.retreats))) {
    const retreat = asRecord(rawValue);
    const meta = retreatMeta(retreatId, retreat);
    const privateRoot = asRecord(asRecord(data.retreatsPrivate)[retreatId]);
    const participantContacts = asRecord(privateRoot.participantContacts);
    for (const [participantKey, rawParticipant] of Object.entries(asRecord(retreat.participants))) {
      const participant = asRecord(rawParticipant);
      const privateContact = asRecord(participantContacts[participantKey]);
      const phone = privateContact.phone ?? participant.phone;
      const pPhone = privateContact.pPhone ?? participant.pPhone;
      const keys = studentKeys(participant.studentId, participant.bu, participantKey);
      const group = findAssignment(retreat.groups, keys);
      const room = findAssignment(retreat.rooms, keys);
      const partialMap = asRecord(retreat.partialAttendances);
      const colorMap = asRecord(retreat.cellColors);
      const partial = [...keys].map((key) => asRecord(partialMap[key])).find((value) => Object.keys(value).length > 0) ?? {};
      const color = [...keys].map((key) => colorMap[key]).find(Boolean);
      const recordFields = fields(
        field("신청 상태", rosterStatus(color) || "신청"), field("부서", participant.bu),
        field("학년·반", `${text(participant.grade)}학년 ${text(participant.class)}반`), field("성별", participant.gender),
        field("조", group ? text(group.value.name) || group.id : ""),
        field("숙소", room ? [room.value.dong, room.value.roomNumber].map(text).filter(Boolean).join(" ") || room.id : ""),
        field("부분 참석", partial.type), field("참석 일차", partial.day ? `${text(partial.day)}일차` : ""), field("부분 참석 메모", partial.note),
        field("신청일", participant.registeredAt), field("학생 연락처", phone, true), field("보호자 연락처", pPhone, true),
        field("특이사항", participant.extra, true),
      );
      const item = evidence({
        name: participant.name, personId: participant.personId,
        sourceId: sourceIdFor(kindForAffiliation(participant.bu), meta.year, participant.studentId, participant.bu), phone, pPhone,
        kind: kindForAffiliation(participant.bu), year: meta.year, contextKey: `retreat:${retreatId}`, anchor: true,
        record: { id: `retreat:${retreatId}:participant:${participantKey}`, category: "수련회", period: meta.period,
          title: "수련회 신청·배정", fields: recordFields, sortKey: `${meta.year}-2` },
      });
      if (item) output.push(item);
    }

    const auxiliary: Array<{ node: string; title: string; labels: Record<string, string>; private?: boolean }> = [
      { node: "tshirtOrders", title: "단체티", labels: { bu: "부서", grade: "학년", class: "반", design: "디자인", size: "사이즈", note: "메모" } },
      { node: "carpools", title: "차량 신청", labels: { bu: "부서", grade: "학년", class: "반", desiredTime: "희망 시간", location: "장소", teacherDriver: "배정 교사", note: "메모", phone: "학생 연락처", pPhone: "보호자 연락처" } },
    ];
    for (const config of auxiliary) {
      for (const [entryId, rawEntry] of Object.entries(asRecord(retreat[config.node]))) {
        const entry = asRecord(rawEntry);
        const recordFields: PersonField[] = [];
        addExtraFields(recordFields, entry, config.labels, config.node === "carpools");
        const entryKind = kindForAffiliation(entry.bu);
        const item = evidence({ name: entry.name ?? entry.studentName, personId: entry.personId,
          sourceId: sourceIdFor(entryKind, meta.year, entry.studentId, entry.bu), phone: entry.phone, pPhone: entry.pPhone,
          kind: entryKind, year: meta.year,
          contextKey: `retreat:${retreatId}`,
          record: { id: `retreat:${retreatId}:${config.node}:${entryId}`, category: "수련회", period: meta.period,
            title: config.title, fields: recordFields, sortKey: `${meta.year}-1`, private: config.private } });
        if (item) output.push(item);
      }
    }

    const privateNodes: Array<{ node: string; title: string; labels: Record<string, string> }> = [
      { node: "cancellations", title: "수련회 취소", labels: { bu: "부서", grade: "학년", class: "반", phone: "학생 연락처", reason: "취소 사유", paymentAmount: "납부액", account: "환불 계좌", note: "메모" } },
      { node: "medicalLogs", title: "의료 일지", labels: { bu: "부서", grade: "학년", classNum: "반", symptoms: "증상", medicines: "처방", outcome: "처리 결과", note: "메모", createdAt: "기록 시각" } },
    ];
    for (const config of privateNodes) {
      for (const [entryId, rawEntry] of Object.entries(asRecord(privateRoot[config.node]))) {
        const entry = asRecord(rawEntry);
        const recordFields: PersonField[] = [];
        addExtraFields(recordFields, entry, config.labels, true);
        const entryKind = kindForAffiliation(entry.bu);
        const item = evidence({ name: entry.name, personId: entry.personId,
          sourceId: sourceIdFor(entryKind, meta.year, entry.studentKey, entry.bu), phone: entry.phone,
          kind: entryKind, year: meta.year,
          contextKey: `retreat:${retreatId}`,
          record: { id: `retreat-private:${retreatId}:${config.node}:${entryId}`, category: "수련회", period: meta.period,
            title: config.title, fields: recordFields, sortKey: `${meta.year}-0`, private: true } });
        if (item) output.push(item);
      }
    }
  }
}

function intersects(a: Set<string>, b: Set<string>) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function assignStudentProgressionIds(items: Evidence[]) {
  const byNameBirth = new Map<string, Evidence[]>();
  for (const item of items) {
    if (item.kind !== "student" || !item.anchor || item.births.size !== 1 || !item.year || !item.studentBu || !item.studentGrade) continue;
    const birth = [...item.births][0];
    const key = `${item.normalizedName}|${birth}`;
    byNameBirth.set(key, [...(byNameBirth.get(key) ?? []), item]);
  }

  for (const [nameBirthKey, candidates] of byNameBirth) {
    const byYear = new Map<string, Evidence[]>();
    candidates.forEach((item) => byYear.set(item.year, [...(byYear.get(item.year) ?? []), item]));
    if ([...byYear.values()].some((sameYear) => sameYear.length > 1)) continue;

    const progressions = new Map<string, Evidence[]>();
    for (const item of candidates) {
      const key = `${item.studentBu}|${item.studentGrade - Number(item.year)}`;
      progressions.set(key, [...(progressions.get(key) ?? []), item]);
    }
    for (const [progressionKey, progression] of progressions) {
      if (progression.length < 2) continue;
      const identity = `student-progression:${nameBirthKey}|${progressionKey}`;
      progression.forEach((item) => item.progressionIds.add(identity));
    }
  }
}

function hasHardIdentityConflict(profile: MutableProfile, item: Evidence) {
  if (!profile.kinds.has(item.kind)) return true;
  if (item.kind === "student" && item.anchor && item.year) {
    const sameYearAnchor = profile.evidence.some((current) => current.anchor && current.year === item.year);
    if (sameYearAnchor && !intersects(profile.sourceIds, item.sourceIds)) return true;
  }
  if (intersects(profile.sourceIds, item.sourceIds) || intersects(profile.progressionIds, item.progressionIds)) return false;
  if (profile.personIds.size > 0 && item.personIds.size > 0 && !intersects(profile.personIds, item.personIds)) return true;
  return false;
}

function matchScore(profile: MutableProfile, item: Evidence) {
  if (hasHardIdentityConflict(profile, item)) return -1;
  if (intersects(profile.personIds, item.personIds)) return 1000;
  if (intersects(profile.progressionIds, item.progressionIds)) return 750;
  if (intersects(profile.sourceIds, item.sourceIds)) return 500;

  const sameBirth = intersects(profile.births, item.births);
  const samePhone = intersects(profile.phones, item.phones);
  if (item.kind === "student") {
    const differentYear = Boolean(item.year) && [...profile.years].some((year) => year && year !== item.year);
    return differentYear && sameBirth && samePhone ? 300 : 0;
  }

  if (item.kind === "teacher" || item.kind === "staff") {
    const birthConflict = profile.births.size > 0 && item.births.size > 0 && !sameBirth;
    if (samePhone && !birthConflict) return 250;
    if (sameBirth) return 200;
  }
  return 0;
}

function attach(profile: MutableProfile, item: Evidence) {
  profile.evidence.push(item);
  item.personIds.forEach((id) => profile.personIds.add(id));
  item.sourceIds.forEach((id) => profile.sourceIds.add(id));
  item.births.forEach((birth) => profile.births.add(birth));
  item.phones.forEach((phone) => profile.phones.add(phone));
  item.parentPhones.forEach((phone) => profile.parentPhones.add(phone));
  item.progressionIds.forEach((id) => profile.progressionIds.add(id));
  if (item.year) profile.years.add(item.year);
  profile.kinds.add(item.kind);
  if (item.anchor) profile.contexts.add(item.contextKey);
}

function makeMutable(item: Evidence): MutableProfile {
  const profile = {
    evidence: [],
    personIds: new Set<string>(),
    sourceIds: new Set<string>(),
    births: new Set<string>(),
    phones: new Set<string>(),
    parentPhones: new Set<string>(),
    progressionIds: new Set<string>(),
    years: new Set<string>(),
    kinds: new Set<PersonKind>(),
    contexts: new Set<string>(),
  };
  attach(profile, item);
  return profile;
}

export function buildPeopleProfiles(data: PeopleSearchData): PersonProfile[] {
  const evidenceList: Evidence[] = [];
  buildClassEvidence(data, evidenceList);
  buildTeacherRosterEvidence(data, evidenceList);
  buildSemesterEvidence(data, evidenceList);
  buildRetreatEvidence(data, evidenceList);
  assignStudentProgressionIds(evidenceList);

  const byName = new Map<string, Evidence[]>();
  evidenceList.forEach((item) => byName.set(item.normalizedName, [...(byName.get(item.normalizedName) ?? []), item]));
  const output: PersonProfile[] = [];

  for (const [normalizedName, items] of byName) {
    items.sort((a, b) => Number(b.record.category === "학적·출석") - Number(a.record.category === "학적·출석"));
    const profiles: MutableProfile[] = [];
    for (const item of items) {
      const candidates = profiles
        .map((profile, index) => ({ profile, index, score: matchScore(profile, item) }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);
      const bestScore = candidates[0]?.score ?? 0;
      const best = candidates.filter((candidate) => candidate.score === bestScore);
      if (best.length === 1) {
        attach(best[0].profile, item);
        continue;
      }
      const contextual = profiles.filter((profile) => profile.contexts.has(item.contextKey) && !hasHardIdentityConflict(profile, item));
      if (!item.anchor && contextual.length === 1) {
        attach(contextual[0], item);
        continue;
      }
      profiles.push(makeMutable(item));
    }

    profiles.forEach((profile, index) => {
      const aliases = [...new Set(profile.evidence.map((item) => cleanDisplayName(item.name)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ko"));
      const records = consolidatePersonRecords(profile.evidence.map((item) => item.record))
        .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
      const classRecords = records.filter((record) => record.category === "학적·출석");
      const years = [...new Set(records.map((record) => record.period.match(/\d{4}/)?.[0]).filter((value): value is string => !!value))].sort().reverse();
      const personId = profile.personIds.size === 1 ? [...profile.personIds][0] : "";
      const latestRosterName = profile.evidence
        .filter((item) => item.kind === "student" && item.anchor && item.record.category === "학적·출석")
        .sort((a, b) => Number(b.year) - Number(a.year))[0]?.name;
      output.push({
        id: personId || `${normalizedName}-${index + 1}`,
        name: cleanDisplayName(latestRosterName) || aliases[0] || normalizedName,
        aliases,
        kinds: [...profile.kinds].sort(), records, years,
        latestClass: classRecords[0] ? `${classRecords[0].period} ${classRecords[0].title}` : undefined,
        ambiguous: profiles.length > 1,
      });
    });
  }
  return output.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function searchPeople(profiles: PersonProfile[], query: string): PersonProfile[] {
  const normalizedQuery = stripSuffix(normalizeName(query));
  if (normalizedQuery.length < 2) return [];
  return profiles
    .filter((profile) => profile.aliases.some((alias) => stripSuffix(normalizeName(alias)).includes(normalizedQuery)))
    .sort((a, b) => Number(stripSuffix(normalizeName(b.name)) === normalizedQuery) - Number(stripSuffix(normalizeName(a.name)) === normalizedQuery))
    .slice(0, 30);
}
