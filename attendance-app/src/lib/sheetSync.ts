// ────────────────────────────────────────────────────────────────
// 구글 시트(출석부) → Firebase 동기화
//
// 한 부(1부/2부)당 스프레드시트 1개, 반 1개 = 탭 1개.
// 탭 식별은 각 탭 CSV의 "제목행"(예: "1부 1학년 1반 김태훈 선생님")으로 한다.
// (탭 이름 규칙에 의존하지 않음 → 명단/통계 등 비반 탭은 자동 무시)
//
// 학생 1명 = 4행: ①순번·이름·학교·생년월일·출석 ②전화 ③주소 ④빈줄
// 출석 마크 "0" = 출석(O). 빈칸은 "이미 지난 주일"만 결석(X)로 처리(미래는 미입력).
//
// ⚠️ classes/{year} + attendance/{year} = 4개 앱이 공유하는 가장 핵심 노드.
//    반드시 미리보기(buildSyncPlan) 확인 후 적용한다.
//
// 페치는 가벼운 per-tab CSV(export?format=csv&gid=) 사용 — 32MB xlsx(사진 포함) 회피.
// 탭 gid 목록은 htmlview에서 추출.
// ────────────────────────────────────────────────────────────────
import { getSundaysForYear } from '@/utils/dates';
import { createPersonId, findHistoricalStudentPersonId } from '@/utils/personId';
import type { Student, AttValue } from '@/types';

export interface ParsedStudent {
  sid: string;
  num: number;
  name: string;
  school: string;
  birth: string;
  phone: string;
  pphone: string;
  addr: string;
  jang: boolean; // 장결자 구역(번호 재시작 이후) 학생 여부
  attendance: Record<string, AttValue>;
}

export interface ParsedClass {
  ck: string;
  part: string;
  grade: number;
  classNum: number;
  teacher: string;
  students: ParsedStudent[];
}

export interface SyncPlan {
  classes: ParsedClass[];
  added:     { ck: string; name: string }[];
  moved:     { name: string; fromCk: string; toCk: string }[];
  removed:   { ck: string; name: string }[];
  ambiguous: { ck: string; name: string }[]; // 동명이인이나 일치 필드 부족으로 신원 확정 불가 → 신규로 처리됨
  attendanceMoves: AttendanceMove[];
  attendanceChanges: number;
  totalStudents: number;
  classCount: number;
  jangCount: number; // 장결자로 표시될 학생 수
}

/**
 * 반이 바뀐 학생의 옛 반 출석 기록 처리 내역.
 * carried  = 시트에 값이 없어 옛 기록에서 새 반으로 옮겨오는 칸 수
 * superseded = 시트에 이미 값이 있어 옛 값이 대체되는 칸 수(관리자가 확인할 수 있게 노출한다)
 */
export interface AttendanceMove {
  name: string;
  fromCk: string;
  toCk: string;
  carried: number;
  superseded: number;
}

/** attendance/{year} 하위 구조 — ck → sid → cellKey → 출석값 */
export type AttendanceYear = Record<string, Record<string, Record<string, AttValue>>>;

/**
 * 반이 바뀐 학생의 옛 출석 기록을 훑어 이관·대체 칸을 가른다.
 * 시트가 원본이므로 **시트에 값이 있는 칸은 건드리지 않고**, 비어 있는 칸만 옛 기록으로 채운다.
 */
function splitOldAttendance(
  oldMarks: Record<string, AttValue> | undefined,
  sheetMarks: Record<string, AttValue>,
): { carry: [string, AttValue][]; superseded: number } {
  const carry: [string, AttValue][] = [];
  let superseded = 0;
  for (const [cellKey, mark] of Object.entries(oldMarks ?? {})) {
    if (!mark) continue;
    if (cellKey in sheetMarks) superseded++;
    else carry.push([cellKey, mark]);
  }
  return { carry, superseded };
}

const csvUrl = (id: string, gid: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}&t=${Date.now()}`;
const htmlUrl = (id: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/htmlview?t=${Date.now()}`;

export function extractSheetId(urlOrId: string): string | null {
  const t = (urlOrId || '').trim();
  if (!t) return null;
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(t)) return t;
  return null;
}

/** CSV 파싱 — 따옴표 안 줄바꿈/쉼표 처리 (행사 셀의 세로 텍스트 대응) */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (q && text[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !q) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

/** htmlview HTML에서 모든 탭 gid 추출 (중복 제거) */
export function extractGids(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/gid=(\d+)/g)) set.add(m[1]);
  return [...set];
}

function cell(rows: string[][], r: number, c: number): string {
  return (rows[r]?.[c] ?? '').toString().trim();
}

/**
 * **이미 지나간** 마지막 주일(KST 기준 자정, UTC ms).
 *
 * 이 값 이하인 날짜 열은 "예배가 끝난 주"로 보고, 시트에서 빈칸이면 결석(X)으로 기록한다.
 * 그래서 경계가 하루만 밀려도 출석 데이터가 통째로 뒤집힌다.
 *
 * ⚠ 일요일 당일은 포함하지 않는다. 예전에는 요일 수만큼만 되감아서, 일요일에는
 * `getUTCDay() === 0` 때문에 오늘 자신이 기준이 됐다. 그 상태로 동기화하면 아직 시트에
 * 옮겨 적지 않은 **그날 앱에서 입력한 출석이 전부 결석으로 덮였다.** 주일 사역 도구가
 * 하필 주일에 가장 위험했다. 일요일이면 7일을 되감아 직전 주일을 기준으로 삼는다.
 */
function lastElapsedSundayUTC(year: number): number {
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const today = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
  const dayOfWeek = today.getUTCDay();
  today.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));
  return today.getTime();
}

/**
 * 한 탭 CSV 행렬 → 반 데이터. 제목행에 "N학년 M반"이 없으면 null(비반 탭).
 */
export function parseClassCsv(rows: string[][], part: string, year: number): ParsedClass | null {
  if (rows.length < 4) return null;

  // 제목행(0행)에서 학년/반/교사 식별
  // 형식: "1부 1학년 1반 …"(1부) 또는 "2부 1-1반 …"(2부) 둘 다 지원
  const title = (rows[0] ?? []).join(' ');
  const tm = title.match(/(\d+)\s*학년\s*(\d+)\s*반/) || title.match(/(\d+)\s*-\s*(\d+)\s*반/);
  if (!tm) return null;
  const grade = parseInt(tm[1]);
  const classNum = parseInt(tm[2]);
  const teacherMatch = title.match(/(\S+)\s*선생님/);
  const teacher = teacherMatch ? teacherMatch[1] : '';

  // 출석 컬럼 → cellKey (헤더 1행=월, 2행=일)
  const months = getSundaysForYear(year);
  const dayToKey: Record<string, string> = {};
  const dayToTime: Record<string, number> = {};
  months.forEach((mo, mi) => mo.sundays.forEach((d, di) => {
    dayToKey[`${mo.month}-${d}`] = `${mi}-${di}`;
    dayToTime[`${mo.month}-${d}`] = Date.UTC(year, mo.month - 1, d);
  }));

  const monthRow = rows[1] ?? [];
  const dayRow = rows[2] ?? [];
  const colKey: Record<number, string> = {};
  const colElapsed: Record<number, boolean> = {};
  const cutoff = lastElapsedSundayUTC(year);
  let curMonth: number | null = null;
  const maxCol = Math.max(monthRow.length, dayRow.length);
  for (let c = 4; c < maxCol; c++) {
    const mm = (monthRow[c] ?? '').toString().match(/(\d+)\s*월/);
    if (mm) curMonth = parseInt(mm[1]);
    const dn = parseInt((dayRow[c] ?? '').toString().trim());
    if (curMonth && dn >= 1 && dn <= 31) {
      const k = dayToKey[`${curMonth}-${dn}`];
      if (k) { colKey[c] = k; colElapsed[c] = dayToTime[`${curMonth}-${dn}`] <= cutoff; }
    }
  }

  const students: ParsedStudent[] = [];
  // 번호가 1로 재시작(이전보다 작아짐)하면 그 이후는 "장결자 명단" 구역.
  // 장결자 sid는 평시 학생(S{학년}{반}_NN)과 번호가 겹치므로 J 접두사로 구분.
  let prevNum = 0;
  let inJang = false;
  for (let i = 3; i < rows.length; i++) {
    const c0 = cell(rows, i, 0);
    const name = cell(rows, i, 1);
    if (!c0 || !name || !/^\d+/.test(c0)) continue;
    const num = parseInt(c0);
    if (num < prevNum) inJang = true;
    prevNum = num;

    const attendance: Record<string, AttValue> = {};
    for (const [cStr, key] of Object.entries(colKey)) {
      const c = Number(cStr);
      const raw = (rows[i]?.[c] ?? '').toString().trim();
      const present = raw === '0' || raw === '○' || raw.toUpperCase() === 'O';
      if (present) attendance[key] = 'O';
      else if (raw === '' && colElapsed[c]) attendance[key] = 'X';
    }

    const nn = String(num).padStart(2, '0');
    students.push({
      sid: inJang ? `S${grade}${classNum}_J${nn}` : `S${grade}${classNum}_${nn}`,
      num, name,
      school: cell(rows, i, 2),
      birth: cell(rows, i, 3),
      phone: cell(rows, i + 1, 2),
      pphone: cell(rows, i + 1, 3),
      addr: cell(rows, i + 2, 2),
      jang: inJang,
      attendance,
    });
  }
  if (students.length === 0) return null;

  return { ck: `${part}-${grade}-${classNum}`, part, grade, classNum, teacher, students };
}

/**
 * 한 부(스프레드시트) 전체 반 파싱.
 * @param onProgress (done, total) 진행 콜백
 */
export async function fetchClassTabs(
  sheetId: string,
  part: string,
  year: number,
  onProgress?: (done: number, total: number) => void
): Promise<ParsedClass[]> {
  const htmlRes = await fetch(htmlUrl(sheetId), { cache: 'no-store' });
  if (!htmlRes.ok) throw new Error('시트 목록을 불러올 수 없습니다. 공유 설정(링크가 있는 모든 사용자 — 뷰어)을 확인해주세요.');
  const gids = extractGids(await htmlRes.text());
  if (gids.length === 0) throw new Error('시트 탭을 찾지 못했습니다.');

  const out: ParsedClass[] = [];
  let done = 0;
  for (const gid of gids) {
    try {
      const res = await fetch(csvUrl(sheetId, gid), { cache: 'no-store' });
      if (res.ok) {
        const pc = parseClassCsv(parseCSV(await res.text()), part, year);
        if (pc) out.push(pc);
      }
    } catch { /* 개별 탭 실패는 건너뜀 */ }
    onProgress?.(++done, gids.length);
  }
  return out;
}

// ── 매칭 정규화 ──────────────────────────────────────────────
const stripSuffix = (n: string) => (n || '').replace(/[A-Za-z]+$/, '').trim();
const normName = (n: string) => stripSuffix(n).replace(/\s+/g, '');
const digits = (s?: string) => (s || '').replace(/\D/g, '');
const normText = (s?: string) => (s || '').replace(/\s+/g, '').trim();

interface CurrentStudent {
  uid: string;   // ck::sid (현재 명단 내 고유)
  ck: string;
  sid: string;
  name: string;
  birth?: string; school?: string; addr?: string; phone?: string; pphone?: string;
  personId?: string;
  photo?: string;
  raw: Student;  // 원본 (제외 학생 보존용)
}

function flattenCurrent(
  current: Record<string, { students?: Record<string, Student> }>
): CurrentStudent[] {
  const out: CurrentStudent[] = [];
  for (const [ck, info] of Object.entries(current)) {
    for (const [sid, s] of Object.entries(info.students ?? {})) {
      if (s?.name) out.push({ uid: `${ck}::${sid}`, ck, sid, ...s, raw: s });
    }
  }
  return out;
}

/** 비교 가능 필드(양쪽 모두 값 있음) 중 일치 수 + 비교 가능 수 */
function fieldStats(a: ParsedStudent, b: CurrentStudent): { match: number; comparable: number } {
  let match = 0, comparable = 0;
  const cmp = (x: string, y: string) => { if (x && y) { comparable++; if (x === y) match++; } };
  cmp(digits(a.birth), digits(b.birth ?? ''));
  cmp(normText(a.school), normText(b.school));
  cmp(normText(a.addr), normText(b.addr));
  cmp(digits(a.phone), digits(b.phone ?? ''));
  cmp(digits(a.pphone), digits(b.pphone ?? ''));
  return { match, comparable };
}

/**
 * 시트 학생 → 현재 명단에서 동일 인물 찾기.
 * 규칙(이름(접미사 제거) 일치 필수):
 *  - 같은 반의 동명 → 같은 사람으로 인정(필드 점수로 최적 후보 선택)
 *  - 다른 반의 동명 → 필드 2개 이상 일치해야만 같은 사람(이동)으로 인정
 *  - 다른 반 동명이 있으나 비교할 필드가 전혀 없으면 → 'ambiguous'(확인 필요, 신규 처리)
 * @returns 매칭된 현재 학생, 'ambiguous', 또는 null(신규)
 */
function matchCurrent(
  st: ParsedStudent,
  ck: string,
  byName: Map<string, CurrentStudent[]>,
  consumed: Set<string>
): CurrentStudent | 'ambiguous' | null {
  const cands = (byName.get(normName(st.name)) ?? []).filter(c => !consumed.has(c.uid));
  if (cands.length === 0) return null;

  // 1) 같은 반에 동명이 있으면 같은 사람 — 필드 점수 최고 후보 선택
  const sameClass = cands.filter(c => c.ck === ck);
  if (sameClass.length > 0) {
    let best = sameClass[0], bestScore = -1;
    for (const c of sameClass) {
      const sc = fieldStats(st, c).match;
      if (sc > bestScore) { best = c; bestScore = sc; }
    }
    return best;
  }

  // 2) 다른 반 동명 — 필드 2개 이상 일치하는 유일 후보만 이동으로 인정
  let best: CurrentStudent | null = null;
  let bestScore = -1, tie = false, anyComparable = false;
  for (const c of cands) {
    const { match, comparable } = fieldStats(st, c);
    if (comparable > 0) anyComparable = true;
    if (match > bestScore) { best = c; bestScore = match; tie = false; }
    else if (match === bestScore) tie = true;
  }
  if (best && bestScore >= 2 && !tie) return best;
  // 확정 불가: 비교 필드가 아예 없었으면 사람 구분 불가 → 확인 필요로 표시, 아니면 신규
  return anyComparable ? null : 'ambiguous';
}

export function buildSyncPlan(
  classes: ParsedClass[],
  current: Record<string, { teacher?: string; students?: Record<string, Student> }>,
  currentAttendance?: AttendanceYear,
): SyncPlan {
  const curList = flattenCurrent(current);
  const byName = new Map<string, CurrentStudent[]>();
  curList.forEach(c => {
    const k = normName(c.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c);
  });

  const added: SyncPlan['added'] = [];
  const moved: SyncPlan['moved'] = [];
  const ambiguous: SyncPlan['ambiguous'] = [];
  const attendanceMoves: AttendanceMove[] = [];
  const consumed = new Set<string>();
  let attendanceChanges = 0;
  let totalStudents = 0;
  let jangCount = 0;

  for (const pc of classes) {
    for (const st of pc.students) {
      totalStudents++;
      if (st.jang) jangCount++;
      attendanceChanges += Object.keys(st.attendance).length;
      const m = matchCurrent(st, pc.ck, byName, consumed);
      if (m === null) { added.push({ ck: pc.ck, name: st.name }); continue; }
      if (m === 'ambiguous') { ambiguous.push({ ck: pc.ck, name: st.name }); continue; }
      consumed.add(m.uid);
      if (m.ck !== pc.ck) {
        moved.push({ name: st.name, fromCk: m.ck, toCk: pc.ck });
        const oldMarks = currentAttendance?.[m.ck]?.[m.sid];
        if (oldMarks && Object.keys(oldMarks).length > 0) {
          const { carry, superseded } = splitOldAttendance(oldMarks, st.attendance);
          attendanceMoves.push({ name: st.name, fromCk: m.ck, toCk: pc.ck, carried: carry.length, superseded });
        }
      }
    }
  }

  // 동기화 대상 반에서, 시트에 의해 매칭되지 못하고 남은 현재 학생 = 제외
  const syncedCks = new Set(classes.map(c => c.ck));
  const removed: SyncPlan['removed'] = [];
  for (const c of curList) {
    if (syncedCks.has(c.ck) && !consumed.has(c.uid)) removed.push({ ck: c.ck, name: c.name });
  }

  return { classes, added, moved, removed, ambiguous, attendanceMoves, attendanceChanges, totalStudents, classCount: classes.length, jangCount };
}

/**
 * 적용 payload 생성.
 * @param removeMissing true면 시트에 없는(제외) 학생을 해당 반에서 삭제. 기본 false=유지.
 */
export function buildSyncPayload(
  plan: SyncPlan,
  year: number,
  current: Record<string, { students?: Record<string, Student> }>,
  removeMissing = false,
  historicalClasses?: unknown,
  currentAttendance?: AttendanceYear,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const curList = flattenCurrent(current);
  const byName = new Map<string, CurrentStudent[]>();
  curList.forEach(c => {
    const k = normName(c.name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(c);
  });
  const consumed = new Set<string>();
  const studentsByCk = new Map<string, Record<string, Partial<Student>>>();

  for (const pc of plan.classes) {
    payload[`classes/${year}/${pc.ck}/teacher`] = pc.teacher || '';
    const studentsObj = studentsByCk.get(pc.ck) ?? studentsByCk.set(pc.ck, {}).get(pc.ck)!;
    for (const st of pc.students) {
      const m = matchCurrent(st, pc.ck, byName, consumed);
      const matched = (m && m !== 'ambiguous') ? m : null;
      if (matched) consumed.add(matched.uid);
      // 같은 반에서 이미 있던 학생이면 기존 sid 재사용(출석 연속성·중복 방지)
      const sid = (matched && matched.ck === pc.ck) ? matched.sid : st.sid;
      const photo = matched?.photo;
      studentsObj[sid] = {
        id: sid,
        personId: matched?.personId
          ?? findHistoricalStudentPersonId(
            st,
            historicalClasses ? [historicalClasses] : [],
            { year, classKey: pc.ck },
          )
          ?? createPersonId('student'),
        num: st.num, name: st.name,
        ...(st.birth ? { birth: st.birth } : {}),
        ...(st.phone ? { phone: st.phone } : {}),
        ...(st.pphone ? { pphone: st.pphone } : {}),
        ...(st.school ? { school: st.school } : {}),
        ...(st.addr ? { addr: st.addr } : {}),
        ...(photo ? { photo } : {}),
        ...(st.jang ? { jang: true } : {}),
      };
      for (const [cellKey, mark] of Object.entries(st.attendance)) {
        payload[`attendance/${year}/${pc.ck}/${sid}/${cellKey}`] = mark;
      }
      // 반이 바뀐 학생은 새 sid·새 경로를 받으므로, 옛 반의 출석 기록이 아무도 참조하지 않는
      // 고아로 남는다. 시트에 없는 칸만 새 경로로 옮긴 뒤 옛 기록을 지운다.
      // (시트가 원본이므로 시트에 값이 있는 칸은 덮지 않는다 — 대체 건수는 미리보기에 표시된다.)
      if (matched && matched.ck !== pc.ck) {
        const oldMarks = currentAttendance?.[matched.ck]?.[matched.sid];
        if (oldMarks && Object.keys(oldMarks).length > 0) {
          for (const [cellKey, mark] of splitOldAttendance(oldMarks, st.attendance).carry) {
            payload[`attendance/${year}/${pc.ck}/${sid}/${cellKey}`] = mark;
          }
          payload[`attendance/${year}/${matched.ck}/${matched.sid}`] = null;
        }
      }
    }
  }

  // 제외(미매칭) 학생: 기본은 유지 — 해당 반 studentsObj에 원본 그대로 다시 포함
  if (!removeMissing) {
    const syncedCks = new Set(plan.classes.map(c => c.ck));
    for (const c of curList) {
      if (syncedCks.has(c.ck) && !consumed.has(c.uid)) {
        const obj = studentsByCk.get(c.ck);
        if (obj && !obj[c.sid]) obj[c.sid] = c.raw;
      }
    }
  }

  for (const [ck, obj] of studentsByCk) {
    payload[`classes/${year}/${ck}/students`] = obj;
  }
  return payload;
}

// ── 행정 변동 사항 기록 ────────────────────────────────────────

/** "1-2-3" → "1부 2-3". 이동 기록에서 어느 반에서 왔는지 밝히는 용도. */
function ckLabel(ck: string): string {
  const [part, grade, cls] = ck.split('-');
  return part && grade && cls ? `${part}부 ${grade}-${cls}` : ck;
}

/** 이름이 많으면 앞 몇 개만 적고 나머지는 수로 줄인다 — 표 한 칸에 들어가야 한다. */
const NAME_CAP = 5;
function joinNames(names: string[]): string {
  if (names.length <= NAME_CAP) return names.join(', ');
  return `${names.slice(0, NAME_CAP).join(', ')} 외 ${names.length - NAME_CAP}명`;
}

export type SheetSyncClassChange = { studentName: string; changeSummary: string };

/**
 * 반 하나의 시트 동기화 기록. **실제 변동이 없으면 null** — 기록을 만들지 않는다.
 *
 * 예전에는 동기화할 때마다 모든 반에 "신규 0명 · 이동 0명"을 남겨, 변동 사항 목록이
 * 아무 일도 없었던 기록으로 가득 찼다. 누가 신규고 누가 이동인지도 알 수 없었다.
 *
 * 전출(이 반을 떠난 학생)도 변동으로 센다. 받는 반에만 남기면 명단에서 사람이 빠진
 * 반은 아무 기록 없이 조용히 줄어든다.
 * 제외(시트에 없어 삭제)도 같은 이유로 센다 — removeMissing을 켠 동기화에서만 생긴다.
 */
export function describeSheetSyncForClass(
  plan: SyncPlan,
  ck: string,
  removeMissing: boolean,
): SheetSyncClassChange | null {
  const added = plan.added.filter((item) => item.ck === ck).map((item) => item.name);
  const movedIn = plan.moved.filter((item) => item.toCk === ck);
  const movedOut = plan.moved.filter((item) => item.fromCk === ck);
  const removed = removeMissing ? plan.removed.filter((item) => item.ck === ck).map((item) => item.name) : [];

  if (added.length + movedIn.length + movedOut.length + removed.length === 0) return null;

  const parts: string[] = [];
  if (added.length) parts.push(`신규 ${added.length}명 (${joinNames(added)})`);
  if (movedIn.length) {
    parts.push(`전입 ${movedIn.length}명 (${joinNames(movedIn.map((item) => `${item.name}←${ckLabel(item.fromCk)}`))})`);
  }
  if (movedOut.length) {
    parts.push(`전출 ${movedOut.length}명 (${joinNames(movedOut.map((item) => `${item.name}→${ckLabel(item.toCk)}`))})`);
  }
  if (removed.length) parts.push(`제외 ${removed.length}명 (${joinNames(removed)})`);

  // 학생 칸은 좁다 — 이름은 변경내용에 두고 여기엔 무엇이 몇 건인지만 적는다.
  const counts = [
    added.length && `신규 ${added.length}명`,
    movedIn.length && `전입 ${movedIn.length}명`,
    movedOut.length && `전출 ${movedOut.length}명`,
    removed.length && `제외 ${removed.length}명`,
  ].filter(Boolean) as string[];

  return {
    studentName: counts.join(' · '),
    changeSummary: `구글 시트 명단·출석 반영 · ${parts.join(' · ')}`,
  };
}
