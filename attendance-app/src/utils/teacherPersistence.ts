export type TeacherFields = { title?: string; name?: string; phone?: string; birth?: string; personId?: string; [key: string]: unknown };

/** 한 교사의 변경 필드만 병합한다. 다른 교사·숨겨진 필드·원격 수정은 덮어쓰지 않는다. */
export function mergeTeacherEdit(current: TeacherFields | null, opened: TeacherFields, values: TeacherFields, personId: string) {
  if (opened.personId && current?.personId !== opened.personId) return undefined;
  if (!current && String(opened.name ?? '').trim()) return undefined;
  const next = { ...(current ?? opened) };
  for (const key of ['title', 'name', 'phone', 'birth'] as const) {
    if (!Object.hasOwn(values, key)) continue;
    const before = String(opened[key] ?? '').trim();
    const desired = String(values[key] ?? '').trim();
    const latest = String(current?.[key] ?? '').trim();
    if (desired === before) continue;
    if (latest !== before && latest !== desired) return undefined;
    next[key] = desired;
  }
  if (current?.personId && current.personId !== personId) return undefined;
  next.personId = current?.personId ?? personId;
  return next;
}
