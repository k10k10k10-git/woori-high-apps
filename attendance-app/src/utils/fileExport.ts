import { calcStats, type AppState } from '@/store/AppContext';
import type { Student } from '@/types';
import { attendanceGrade } from './attendanceHistory';
import { normalizeAttendanceValue } from './attendanceValue';
import { evKey } from './dates';
import { buildPastoralReport, type ReportSort } from './pastoralReport';
import { pastoralContactWorkbook } from './pastoralContactExport';
import { handoffBirth } from './youthHandoff';

type Source = Pick<AppState, 'curYear' | 'classData' | 'attData' | 'months' | 'events'>;
export type FileExportSelection = { kind: 'roster'; part: '1' | '2' }
  | { kind: 'class'; classKey: string }
  | { kind: 'absent'; weekKey?: string; sort?: ReportSort }
  | { kind: 'recovered'; weekKey?: string; sort?: ReportSort };
export type FileSheet = {
  name: string; rows: (string | number | Date)[][]; headerRow: number; widths: number[];
  freezeColumns?: number; monthHeaderRow?: number;
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  attendanceColumns?: number[]; eventColumns?: number[]; futureColumns?: number[];
  percentColumns?: number[]; dateColumns?: number[];
};
export type FileWorkbook = { filename: string; label: string; count: number; sheets: FileSheet[] };

const RULE = '출석률 = O / 파일의 O·X 집계. 행사·일반 학생 미입력 제외. 등급 A ≥ 90%, B ≥ 80%, C ≥ 70%, D < 70%. 기록 없음은 —.';
const LEGEND = 'O 출석 · X 결석 · 행사 산정 제외. 장결자의 지난 정상 주일 빈칸은 파일에서만 X로 표시·집계합니다. 기존 O·미래 날짜·DB 원본은 유지합니다.';

/** 월·주일 인덱스를 유지하며 미래 기록을 통계에 섞지 않는다. 원본 원장은 변경하지 않는다. */
export function buildFileWorkbook(source: Source, selection: FileExportSelection, nowMs = Date.now()): FileWorkbook {
  const extractedOn = new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (source.curYear > Number(extractedOn.slice(0, 4))) throw new Error('아직 시작하지 않은 연도는 내려받을 수 없습니다.');
  if (selection.kind === 'absent' || selection.kind === 'recovered') {
    const report = buildPastoralReport(source, [], nowMs, selection.weekKey);
    if (selection.weekKey && report.selectedWeek?.key !== selection.weekKey) throw new Error('조회할 기준 주일이 변경되었습니다. 다시 선택해 주세요.');
    const file = pastoralContactWorkbook(report, source.curYear, selection.kind, selection.sort ?? 'absence');
    return { ...file, sheets: [{ name: file.label, rows: file.rows, headerRow: 5, widths: [20, 24, 24, 26, 12, 26, 20], freezeColumns: 1, dateColumns: [6] }] };
  }
  const classKeys = Object.keys(source.classData).filter(key => /^[12]-[1-3]-[1-9]\d*$/.test(key)
    && (selection.kind === 'roster' ? key.startsWith(`${selection.part}-`) : key === selection.classKey))
    .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  if (!classKeys.length) throw new Error('내려받을 반 명단이 없습니다.');
  const endsOn = extractedOn < `${source.curYear}-12-31` ? extractedOn : `${source.curYear}-12-31`;
  const months = source.months.map(month => ({ ...month, sundays: month.sundays.filter(day => dateKey(month.month, day) <= endsOn) }));
  const statsSource = { ...source, months, curView: 'all' as const };
  const weeks = source.months.flatMap(({ month, sundays }, mi) => sundays.map((day, di) => ({
    key: evKey(mi, di), month, day, date: dateKey(month, day), event: source.events[evKey(mi, di)],
  })));
  const rows = classKeys.flatMap(classKey => [...source.classData[classKey].students]
    .sort((a, b) => Number(a.jang === true) - Number(b.jang === true) || (a.num ?? Infinity) - (b.num ?? Infinity)
      || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id))
    .map(student => {
      // 장결 미입력 보완은 Excel용 사본에만 적용한다. 실제 목양·출석 원장을 바꾸지 않는다.
      const attendance = { ...source.attData[classKey]?.[student.id] };
      if (student.jang === true) for (const week of weeks) {
        if (!week.event && week.date <= endsOn && !normalizeAttendanceValue(attendance[week.key])) attendance[week.key] = 'X';
      }
      const stats = calcStats({ ...statsSource, attData: { [classKey]: { [student.id]: attendance } } }, classKey, student.id);
      return { classKey, student, stats, attendance };
    }));
  const label = selection.kind === 'roster' ? `${selection.part}부 전체 명단` : `${classLabel(selection.classKey)} 출석부`;
  const intro = (title: string, count: number) => [
    [`${source.curYear}년 ${title}`],
    [`전체 ${count}명 · 추출일 ${extractedOn} · 출석 집계 ${source.curYear}-01-01 ~ ${endsOn}`],
    [RULE], [LEGEND],
  ];
  function attendanceSheet(name: string, selectedRows: typeof rows, wholePart = false): FileSheet {
    const fixed = wholePart ? ['번호', '소속 반', '학생 이름', '구분', '출석/기록', '출석률', '등급'] : ['번호', '학생 이름', '구분', '출석/기록', '출석률', '등급'];
    const start = fixed.length;
    const info = ['학교', '생년월일', '본인 연락처', '보호자 연락처', '주소'];
    const data = selectedRows.map(({ classKey, student, stats, attendance }, index) => {
      const recorded = stats.present + stats.absent;
      return [index + 1, ...(wholePart ? [classLabel(classKey)] : []), student.name.trim() || '미등록', student.jang ? '장결' : '일반',
        recorded ? `${stats.present}/${recorded}` : '—', recorded ? stats.rate / 100 : '—', recorded ? attendanceGrade(stats.rate) : '—',
        ...weeks.map(week => week.event ? '행사' : week.date > endsOn ? '' : normalizeAttendanceValue(attendance[week.key])),
        student.school?.trim() || '미등록', birthCell(student), student.phone?.trim() || '미등록', student.pphone?.trim() || '미등록', student.addr?.trim() || '미등록'];
    });
    const grouped: (string | number | Date)[] = Array(start + weeks.length + info.length).fill('');
    grouped[0] = '학생 정보 · 누적 출석'; grouped[start + weeks.length] = '연락처 · 기본 정보';
    const merges: NonNullable<FileSheet['merges']> = [{ s: { r: 4, c: 0 }, e: { r: 4, c: start - 1 } },
      { s: { r: 4, c: start + weeks.length }, e: { r: 4, c: grouped.length - 1 } }];
    for (let index = 0; index < weeks.length;) {
      let end = index;
      while (end + 1 < weeks.length && weeks[end + 1].month === weeks[index].month) end++;
      grouped[start + index] = `${weeks[index].month}월`;
      if (end > index) merges.push({ s: { r: 4, c: start + index }, e: { r: 4, c: start + end } });
      index = end + 1;
    }
    return { name, rows: [...intro(wholePart ? label : `${classLabel(selectedRows[0]?.classKey ?? classKeys[0])} 출석부`, selectedRows.length),
      grouped, [...fixed, ...weeks.map(week => `${week.month}/${week.day}${week.event ? `\n${week.event}` : ''}`), ...info], ...data],
      headerRow: 5, monthHeaderRow: 4, freezeColumns: start, merges,
      widths: [...(wholePart ? [7, 21, 16, 9, 13, 11, 8] : [7, 16, 9, 13, 11, 8]), ...weeks.map(() => 8), 22, 17, 23, 23, 42],
      attendanceColumns: weeks.map((_, index) => start + index), eventColumns: weeks.flatMap((week, index) => week.event ? [start + index] : []),
      futureColumns: weeks.flatMap((week, index) => week.date > endsOn ? [start + index] : []), percentColumns: [start - 2], dateColumns: [start + weeks.length + 1] };
  }
  const sheets: FileSheet[] = [];
  if (selection.kind === 'roster') {
    sheets.push({ name: '반별 요약', rows: [...intro(label, rows.length), [], ['소속 반', '담임 교사', '전체 인원', '일반', '장결', '출석 기록', '집계 기록(O·X)', '출석률'],
      ...classKeys.map(classKey => {
        const selected = rows.filter(row => row.classKey === classKey);
        const present = selected.reduce((sum, row) => sum + row.stats.present, 0);
        const recorded = selected.reduce((sum, row) => sum + row.stats.present + row.stats.absent, 0);
        return [classLabel(classKey), source.classData[classKey].teacher?.trim() || '미등록', selected.length,
          selected.filter(row => !row.student.jang).length, selected.filter(row => row.student.jang).length, present, recorded, recorded ? Math.round(present / recorded * 100) / 100 : '—'];
      })], headerRow: 5, freezeColumns: 1, widths: [24, 20, 14, 12, 12, 16, 16, 15], percentColumns: [7] });
    sheets.push({ name: '학생 명단', rows: [...intro(label, rows.length), [],
      ['소속 반', '학생 이름', '본인 연락처', '보호자 연락처', '학교', '생년월일', '주소', '출석률', '등급', '구분'],
      ...rows.map(({ classKey, student, stats }) => [classLabel(classKey), student.name.trim() || '미등록', student.phone?.trim() || '미등록',
        student.pphone?.trim() || '미등록', student.school?.trim() || '미등록', birthCell(student), student.addr?.trim() || '미등록',
        stats.present + stats.absent ? stats.rate / 100 : '—', stats.present + stats.absent ? attendanceGrade(stats.rate) : '—', student.jang ? '장결' : '일반'])],
      headerRow: 5, freezeColumns: 2, widths: [24, 18, 24, 24, 22, 18, 42, 13, 10, 11], percentColumns: [7], dateColumns: [5] });
    sheets.push(attendanceSheet('전체 학생·연간 출석', rows, true));
  }
  for (const classKey of classKeys) {
    const [, grade, cls] = classKey.split('-');
    const sheet = attendanceSheet(`${grade}학년 ${cls}반`, rows.filter(row => row.classKey === classKey));
    // 빈 반도 해당 반 제목과 열을 유지한다.
    sheet.rows[0] = [`${source.curYear}년 ${classLabel(classKey)} 출석부`];
    sheets.push(sheet);
  }
  return { label, count: rows.length, sheets, filename: `${selection.kind === 'roster' ? `${source.curYear}_${selection.part}부_전체명단` : `${source.curYear}_${selection.classKey}_반별출석부`}_${extractedOn}.xlsx` };

  function dateKey(month: number, day: number) { return `${source.curYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
}

function classLabel(classKey: string) { const [part, grade, cls] = classKey.split('-'); return `${part}부 ${grade}학년 ${cls}반`; }
function birthCell(student: Student): string | Date {
  const value = handoffBirth(student.birth);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** SheetJS 내장 ZIP만 사용해 값 생성은 유지하고 OOXML의 시각 서식·고정 창만 덧붙인다. */
export async function fileWorkbookBytes(file: FileWorkbook): Promise<Uint8Array<ArrayBuffer>> {
  const { utils, write, CFB } = await import('xlsx');
  const workbook = utils.book_new();
  for (const sheet of file.sheets) {
    const worksheet = utils.aoa_to_sheet(sheet.rows);
    worksheet['!cols'] = sheet.widths.map(wch => ({ wch }));
    worksheet['!merges'] = [...Array.from({ length: 4 }, (_, r) => ({ s: { r, c: 0 }, e: { r, c: sheet.rows[sheet.headerRow].length - 1 } })), ...(sheet.merges ?? [])];
    worksheet['!autofilter'] = { ref: utils.encode_range({ s: { r: sheet.headerRow, c: 0 }, e: { r: sheet.rows.length - 1, c: sheet.rows[sheet.headerRow].length - 1 } }) };
    utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  const zip = CFB.read(new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' })), { type: 'array' });
  const decode = (path: string) => new TextDecoder().decode(CFB.find(zip, path).content);
  const replace = (path: string, xml: string) => CFB.utils.cfb_add(zip, path, new TextEncoder().encode(xml));
  replace('/xl/styles.xml', workbookStyles());
  file.sheets.forEach((sheet, index) => {
    const path = `/xl/worksheets/sheet${index + 1}.xml`;
    let xml = decode(path);
    const x = sheet.freezeColumns ?? 1; const y = sheet.headerRow + 1;
    xml = xml.replace(/<sheetView\b[^>]*\/>/, `<sheetView workbookViewId="0" showGridLines="0"><pane xSplit="${x}" ySplit="${y}" topLeftCell="${utils.encode_cell({ r: y, c: x })}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${utils.encode_cell({ r: y, c: x })}" sqref="${utils.encode_cell({ r: y, c: x })}"/></sheetView>`);
    xml = xml.replace(/<row r="(\d+)"/g, (match, row) => `${match} ht="${rowHeight(sheet, Number(row) - 1)}" customHeight="1"`);
    xml = xml.replace(/<c\b([^>]*)>/g, (match, attributes: string) => {
      const address = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      if (!address) return match;
      const { r, c } = utils.decode_cell(address);
      const value = sheet.rows[r]?.[c];
      let style = r === 0 ? 1 : r < (sheet.monthHeaderRow ?? sheet.headerRow) ? 2 : r === sheet.monthHeaderRow ? 3 : r === sheet.headerRow ? 4 : r % 2 ? 5 : 0;
      if (r > sheet.headerRow) {
        if (sheet.percentColumns?.includes(c) && typeof value === 'number') style = 9;
        else if (sheet.dateColumns?.includes(c) && value instanceof Date) style = 10;
        else if (sheet.attendanceColumns?.includes(c)) style = sheet.eventColumns?.includes(c) ? 8 : sheet.futureColumns?.includes(c) ? 11 : value === 'O' ? 6 : value === 'X' ? 7 : style;
      } else if (r === sheet.headerRow && sheet.eventColumns?.includes(c)) style = 8;
      return `<c${attributes.replace(/\s+s="\d+"/, '')} s="${style}">`;
    });
    replace(path, xml);
  });
  return new Uint8Array(CFB.write(zip, { fileType: 'zip', type: 'array', compression: true }));
}

export async function downloadFileWorkbook(file: FileWorkbook, beforeDownload?: () => void): Promise<void> {
  const bytes = await fileWorkbookBytes(file);
  beforeDownload?.();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.filename;
  try { anchor.click(); } finally { URL.revokeObjectURL(url); }
}

function rowHeight(sheet: FileSheet, row: number): number {
  if (row === 0) return 32;
  if (row < sheet.headerRow) return 24;
  // 한글은 영문 두 글자 너비로 보수적으로 잡아 주소·행사 이름의 줄바꿈이 잘리지 않게 한다.
  const lines = Math.max(1, ...sheet.rows[row].map((value, column) => String(value instanceof Date ? 'yyyy-mm-dd' : value).split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 2 : 1), 0) / Math.max(1, sheet.widths[column] - 2))), 0)));
  return Math.min(409, Math.max(row === sheet.headerRow ? 38 : 24, lines * 16 + 8));
}

function workbookStyles(): string {
  const font = (color: string, size = 11, bold = false) => `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="맑은 고딕"/>${bold ? '<b/>' : ''}</font>`;
  const fill = (color: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf = (fontId: number, fillId: number, numFmtId = 0, center = false, borderId = 1) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="center"${center ? ' horizontal="center"' : ''} wrapText="1"/></xf>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="7">${font('292A35')}${font('57469A', 16, true)}${font('686979', 10)}${font('FFFFFF', 11, true)}${font('266447', 11, true)}${font('A23540', 11, true)}${font('825B1E', 10)}</fonts><fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${['7565AC', 'EFECF7', 'F9F8FC', 'E6F3EB', 'FCEBED', 'FFF1CD', 'F0F1F4'].map(fill).join('')}</fills><borders count="2"><border/><border><bottom style="hair"><color rgb="FFE1E3EA"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${[
    xf(0, 0), xf(1, 0, 0, false, 0), xf(2, 0, 0, false, 0), xf(3, 2, 0, true), xf(0, 3, 0, true), xf(0, 4),
    xf(4, 5, 0, true), xf(5, 6, 0, true), xf(6, 7, 0, true), xf(0, 3, 9, true), xf(0, 0, 164), xf(2, 8, 0, true),
  ].join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
