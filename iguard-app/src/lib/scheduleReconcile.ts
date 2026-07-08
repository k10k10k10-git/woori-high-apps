/** 큐싯 재임포트 안전화 — 순수 로직 (DB 접근 없음).
 *  ① reconcileScheduleImport: 시트 블록과 기존 블록을 day__start 키로 대조해
 *     "내용만 갱신(ID·동선 보존) / 신규 생성 / 시트에서 사라짐(삭제 후보)"로 분류한다.
 *     기존 방식(전체 삭제 후 새 ID 재생성)은 손으로 만든 동선을 통째로 유실시켰다 — 이 함수가 ID를 보존해 막는다.
 *  ② hashCsv: 임포트한 원본 텍스트의 결정적 해시. "시트가 임포트 이후 바뀌었는지"(스냅샷 어긋남) 판정에 쓴다. */

/** 블록 동일성 키 — scheduleSortValue/leaderMap과 같은 규칙(day__start). 시트에서 시간이 바뀌면 다른 블록으로 취급된다. */
export function blockKey(day: number, start: string): string {
  return `${day}__${start}`;
}

export interface ReconcileResult<E, I> {
  /** 시트에도 있고 앱에도 있던 블록 — ID를 유지한 채 내용만 갱신(동선·수기 배정 보존) */
  updates: { id: string; imported: I }[];
  /** 시트에만 있는 블록 — 새로 생성 */
  creates: I[];
  /** 앱에만 남은 블록(시트에서 사라짐) — 삭제 후보. 병합 모드는 무시, 교체 모드만 삭제 */
  deletes: E[];
}

export function reconcileScheduleImport<
  E extends { id: string; day: number; start: string },
  I extends { day: number; start: string },
>(existing: E[], imported: I[]): ReconcileResult<E, I> {
  const existingByKey = new Map<string, E>();
  for (const b of existing) {
    const k = blockKey(b.day, b.start);
    if (!existingByKey.has(k)) existingByKey.set(k, b); // 중복 키가 있으면 첫 번째만 매칭 대상
  }
  const importedKeys = new Set<string>();
  const updates: { id: string; imported: I }[] = [];
  const creates: I[] = [];
  for (const imp of imported) {
    const k = blockKey(imp.day, imp.start);
    importedKeys.add(k);
    const match = existingByKey.get(k);
    if (match) updates.push({ id: match.id, imported: imp });
    else creates.push(imp);
  }
  const deletes = existing.filter(b => !importedKeys.has(blockKey(b.day, b.start)));
  return { updates, creates, deletes };
}

/** 임포트 원본 텍스트의 결정적 해시(djb2). 줄바꿈(CRLF/CR→LF)·앞뒤 공백은 정규화해 사소한 차이로 오탐하지 않는다. */
export function hashCsv(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (((h << 5) + h) + normalized.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
