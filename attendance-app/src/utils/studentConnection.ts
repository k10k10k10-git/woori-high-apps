import type { Student } from '@/types';

export type StudentCandidate = { classKey: string; student: Student; storedId?: string };
export type StudentReference = Pick<Student, 'name' | 'personId' | 'birth' | 'phone'> & { id?: string };
export type StudentConnection = { status: 'matched'; candidate: StudentCandidate } | { status: 'review' | 'missing' };
const text = (value?: string) => (value ?? '').trim().normalize('NFC');
const digits = (value?: string) => text(value).replace(/\D/g, '');

/** 반/연도별 SID만으로 연결하지 않는다. 영구 ID를 우선하고 불확실한 후보는 보류한다. */
export function resolveStudentConnection(reference: StudentReference, candidates: StudentCandidate[], allowLegacyId = false): StudentConnection {
  const personId = text(reference.personId);
  if (personId) {
    const exact = candidates.filter(({ student }) => text(student.personId) === personId);
    if (exact.length === 1) return { status: 'matched', candidate: exact[0] };
    if (exact.length > 1) return { status: 'review' };
  }
  const named = candidates.filter(({ student }) => text(student.name) === text(reference.name));
  const compatible = named.filter(({ student }) => {
    if (personId && student.personId && personId !== text(student.personId)) return false;
    const birth = digits(reference.birth), otherBirth = digits(student.birth);
    const phone = digits(reference.phone), otherPhone = digits(student.phone);
    if (birth.length >= 6 && otherBirth.length >= 6 && birth !== otherBirth) return false;
    if (phone.length >= 8 && otherPhone.length >= 8 && phone !== otherPhone) return false;
    return (birth.length >= 6 && birth === otherBirth) || (phone.length >= 8 && phone === otherPhone);
  });
  if (compatible.length === 1) return { status: 'matched', candidate: compatible[0] };
  if (compatible.length > 1) return { status: 'review' };
  const sameId = candidates.filter(({ student, storedId }) => !!reference.id && (student.id === reference.id || storedId === reference.id));
  // 옛 심방 요청에는 신상정보가 없다. 연도 전체에서 SID가 유일하고 이름도 일치할 때만 연결한다.
  if (allowLegacyId && !personId && sameId.length === 1 && text(sameId[0].student.name) === text(reference.name)) {
    return { status: 'matched', candidate: sameId[0] };
  }
  return { status: named.length || sameId.length ? 'review' : 'missing' };
}
