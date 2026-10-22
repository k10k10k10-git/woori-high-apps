import type { Student } from '@/types';
import { normalizeName } from './personId';
import { handoffBirth } from './youthHandoff';

export type DuplicateRoster = Record<string, { students?: Record<string, Student> }>;
export type StudentLocation = { classKey: string; studentId: string };
type RosterStudent = StudentLocation & { student: Student };
type DuplicateEvidence = { reason: 'personId' | 'birth' | 'phone' | 'name'; strong: boolean };
export type StudentDuplicate = RosterStudent & DuplicateEvidence;
export type StudentDuplicatePair = { left: RosterStudent; right: RosterStudent } & DuplicateEvidence;

const text = (value: unknown) => typeof value === 'string' ? value.trim().normalize('NFC') : '';
const nameOf = (student: Student) => normalizeName(text(student.name));
const birthOf = (student: Student) => {
  const birth = handoffBirth(text(student.birth));
  return /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : '';
};
const phoneOf = (student: Student) => {
  const raw = text(student.phone);
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  const phone = raw.replace(/\D/g, '').replace(/^82(?=[1-9])/, '0');
  return /^0\d{8,10}$/.test(phone) && !/^0+$/.test(phone.slice(3)) ? phone : '';
};

function evidence(left: Student, right: Student): DuplicateEvidence | null {
  const personId = text(left.personId);
  if (personId && personId === text(right.personId)) return { reason: 'personId', strong: true };
  const name = nameOf(left);
  if (name.length < 2 || name !== nameOf(right)) return null;
  const birth = birthOf(left), otherBirth = birthOf(right);
  if (birth && birth === otherBirth) return { reason: 'birth', strong: true };
  const birthConflict = birth && otherBirth && birth !== otherBirth;
  const phone = phoneOf(left);
  if (!birthConflict && phone && phone === phoneOf(right)) return { reason: 'phone', strong: true };
  return { reason: 'name', strong: false };
}

function rosterStudents(roster: DuplicateRoster): RosterStudent[] {
  return Object.entries(roster).flatMap(([classKey, info]) =>
    Object.entries(info?.students ?? {}).flatMap(([studentId, student]) =>
      student && typeof student === 'object' ? [{ classKey, studentId, student }] : []));
}

/** 같은 이름만으로 합치지 않는다. 원본 명단·신상·출석은 읽기만 한다. */
export function findStudentDuplicates(student: Student, roster: DuplicateRoster, exclude?: StudentLocation): StudentDuplicate[] {
  return rosterStudents(roster).flatMap(candidate => {
    if (candidate.classKey === exclude?.classKey && candidate.studentId === exclude.studentId) return [];
    const match = evidence(student, candidate.student);
    return match ? [{ ...candidate, ...match }] : [];
  });
}

export function findStudentDuplicatePairs(roster: DuplicateRoster): StudentDuplicatePair[] {
  const students = rosterStudents(roster), pairs: StudentDuplicatePair[] = [];
  // ponytail: 수백 명 원장은 쌍별 비교로 충분하다. 수만 명이면 정규화 신원 인덱스로 바꾼다.
  for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) {
      const match = evidence(students[i].student, students[j].student);
      if (match) pairs.push({ left: students[i], right: students[j], ...match });
    }
  }
  return pairs;
}

/** 기존 중복의 무관한 정보 수정은 허용하고, 새로 생기는 강한 중복만 차단한다. */
export function assertNoNewStudentDuplicates(nextStudent: Student, roster: DuplicateRoster, exclude?: StudentLocation, previousStudent?: Student): void {
  const duplicate = findStudentDuplicates(nextStudent, roster, exclude).find(candidate =>
    candidate.strong && !(previousStudent && evidence(previousStudent, candidate.student)?.strong));
  if (!duplicate) return;
  const classLabel = duplicate.classKey.replace(/^(\d+)-(\d+)-(\d+)$/, '$1부 $2학년 $3반');
  const guidance = duplicate.classKey === exclude?.classKey
    ? '기존 학생의 입력 표기를 확인해 같은 명단에 연결하거나 학생 정보 수정에서 변경해 주세요.'
    : '기존 학생을 확인한 뒤 소속 이동을 이용해 주세요.';
  throw new Error(`${classLabel}에 동일 학생으로 보이는 명단이 있습니다. ${guidance} 명단과 출석 기록은 변경하지 않았습니다.`);
}
