export function applyRealtimeRecordChild(
  current: Record<string, unknown>,
  key: string,
  value: unknown,
  removed = false,
): Record<string, unknown> {
  const next = { ...current };
  if (removed) delete next[key];
  else next[key] = value;
  return next;
}
