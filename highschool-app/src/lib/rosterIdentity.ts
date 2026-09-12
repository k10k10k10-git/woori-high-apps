/** 반·학생 키가 바뀌어도 같은 연도의 유일한 영구 인물 ID만 따라간다. 이름은 근거가 아니다. */
export function uniqueRosterStudent<T extends { personId?: string }>(
  classes: Record<string, { students?: Record<string, T> }> | null | undefined,
  personId: string | undefined,
): T | null {
  if (!personId?.startsWith('person_student_')) return null;
  const matches = Object.values(classes ?? {}).flatMap(c => Object.values(c.students ?? {}))
    .filter(student => student.personId === personId);
  return matches.length === 1 ? matches[0] : null;
}
