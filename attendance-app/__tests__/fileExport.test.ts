import { expect, it, vi } from 'vitest';
import { CFB, read, utils } from 'xlsx';
import { initialState, type AppState } from '@/store/AppContext';
import { getSundaysForYear } from '@/utils/dates';
import { buildFileWorkbook, downloadFileWorkbook, fileWorkbookBytes } from '@/utils/fileExport';

const now = Date.parse('2026-10-20T10:00:00+09:00');
function fixture(): AppState {
  return { ...initialState, curYear: 2026, curView: 'second', curPart: '2', curGrade: '3', curClass: '7',
    months: getSundaysForYear(2026), events: { '0-1': '합동 예배' },
    classData: {
      '1-1-10': { teacher: '가상 교사', students: [{ id: 'a', name: '가학생', phone: '01000000001', pphone: '01000000002', birth: '2008. 01. 31', school: '=가상고', addr: '가상 주소' }, { id: 'b', name: '나학생', jang: true }, { id: 'c', name: '다학생' }] },
      '1-1-2': { students: [] },
      '2-2-7': { students: [{ id: 'a', name: '가학생', phone: '01000000003', pphone: '+821000000004' }] },
    }, attData: { '1-1-10': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '11-0': 'O' }, b: { '0-0': 'X' } }, '2-2-7': { a: { '0-0': 'X' } } } };
}

it('화면 필터와 무관하게 부서를 나누고 장결·빈 반·동명이인을 원본 그대로 포함한다', () => {
  const state = fixture(); const before = structuredClone(state);
  const first = buildFileWorkbook(state, { kind: 'roster', part: '1' }, now);
  expect(first.count).toBe(3);
  expect(first.sheets.map(sheet => sheet.name)).toEqual(['반별 요약', '학생 명단', '전체 학생·연간 출석', '1학년 2반', '1학년 10반']);
  expect(first.filename).toBe('2026_1부_전체명단_2026-10-20.xlsx');
  expect(first.sheets[3].rows[0][0]).toBe('2026년 1부 1학년 2반 출석부');
  expect(first.sheets[4].rows.slice(6).map(row => row[1])).toEqual(['가학생', '다학생', '나학생']);
  expect(first.sheets[1].rows[5]).toEqual(['소속 반', '학생 이름', '본인 연락처', '보호자 연락처', '학교', '생년월일', '주소', '출석률', '등급', '구분']);
  const second = buildFileWorkbook(state, { kind: 'roster', part: '2' }, now);
  expect(second.count).toBe(1); expect(second.sheets[1].rows[6][1]).toBe('가학생');
  expect(state).toEqual(before);
});

it('52개 실제 주일을 빈 슬롯 없이 포함하며 행사·미래·미입력은 결석으로 바꾸지 않는다', () => {
  const state = fixture();
  const file = buildFileWorkbook(state, { kind: 'class', classKey: '1-1-10' }, now);
  const sheet = file.sheets[0]; const row = sheet.rows[6];
  expect(sheet.attendanceColumns).toHaveLength(52);
  expect(sheet.rows).toHaveLength(9); expect(sheet.rows[5]).toHaveLength(63);
  expect(sheet.rows[5][6]).toBe('1/4'); expect(sheet.rows[5][7]).toBe('1/11\n합동 예배');
  expect(row.slice(3, 9)).toEqual(['1/2', .5, 'D', 'O', '행사', 'X']);
  expect(row[9]).toBe('');
  expect(row[sheet.attendanceColumns![48]]).toBe('');
  const longAbsent = sheet.rows.find(row => row[1] === '나학생')!;
  expect(longAbsent.slice(2, 6)).toEqual(['장결', '0/1', 0, 'D']);
  expect(sheet.rows.find(row => row[1] === '다학생')!.slice(3, 6)).toEqual(['—', '—', '—']);
});

it('과거 연도는 연말까지 계산하고 미래 연도·없는 반·잘못된 기준 주일은 거절한다', () => {
  const state = fixture();
  expect(buildFileWorkbook(state, { kind: 'class', classKey: '1-1-10' }, Date.parse('2027-01-01T00:00:00+09:00')).sheets[0].rows[6].slice(3, 6)).toEqual(['2/3', .67, 'D']);
  expect(() => buildFileWorkbook({ ...state, curYear: 2027 }, { kind: 'roster', part: '1' }, now)).toThrow('시작하지 않은');
  expect(() => buildFileWorkbook(state, { kind: 'class', classKey: '1-3-99' }, now)).toThrow('반 명단');
  expect(() => buildFileWorkbook(state, { kind: 'absent', weekKey: 'bad' }, now)).toThrow('기준 주일');
});

it('레거시 출석 정규화와 등급 경계를 공용 계산으로 유지한다', () => {
  const state = fixture(); state.events = {};
  state.attData['1-1-10'].a = { '0-0': 'T', '0-1': 'X' } as unknown as AppState['attData'][string][string];
  expect(buildFileWorkbook(state, { kind: 'class', classKey: '1-1-10' }, now).sheets[0].rows[6].slice(3, 6)).toEqual(['1/2', .5, 'D']);
});

it('연속 결석·다시 출석은 기존 6열을 유지하고 보호자 연락처를 마지막 열에 추가한다', () => {
  const state = fixture(); state.events = {};
  state.attData['1-1-10'].a = { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' };
  state.attData['2-2-7'].a = { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X' };
  const absent = buildFileWorkbook(state, { kind: 'absent', weekKey: '0-3' }, now);
  const recovered = buildFileWorkbook(state, { kind: 'recovered', weekKey: '0-3' }, now);
  expect(absent.count).toBe(1); expect(recovered.count).toBe(1);
  expect(absent.sheets[0].rows[5][6]).toBe('보호자 연락처');
  expect(absent.sheets[0].rows[6][6]).toBe('+821000000004');
  expect(recovered.sheets[0].rows[6]).toEqual(['가학생', '01000000001', '1부 1학년 10반', '일반', 3, new Date(2026, 0, 25), '01000000002']);
});

it('실제 XLSX 재읽기에서 날짜·숫자 퍼센트·전화번호 문자열·고정창·상태 서식을 유지한다', async () => {
  const state = fixture(); state.classData['1-1-10'].students[0].addr = '가'.repeat(60);
  const file = buildFileWorkbook(state, { kind: 'class', classKey: '1-1-10' }, now);
  const bytes = await fileWorkbookBytes(file);
  const workbook = read(bytes, { type: 'array', cellDates: true, cellStyles: true });
  expect(workbook.SheetNames).toEqual(['1학년 10반']);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  expect(sheet.E7).toMatchObject({ t: 'n', v: .5, z: '0%' });
  const phoneColumn = file.sheets[0].rows[5].indexOf('본인 연락처');
  const guardianColumn = file.sheets[0].rows[5].indexOf('보호자 연락처');
  expect(sheet[utils.encode_cell({ r: 6, c: phoneColumn })]).toMatchObject({ t: 's', v: '01000000001' });
  expect(sheet[utils.encode_cell({ r: 6, c: guardianColumn })]).toMatchObject({ t: 's', v: '01000000002' });
  const birthColumn = file.sheets[0].rows[5].indexOf('생년월일');
  const birth = sheet[utils.encode_cell({ r: 6, c: birthColumn })];
  expect(birth).toMatchObject({ t: 'd', z: 'yyyy-mm-dd' });
  expect((birth.v as Date).getFullYear()).toBe(2008);
  const school = sheet[utils.encode_cell({ r: 6, c: phoneColumn - 2 })];
  expect(school).toMatchObject({ t: 's', v: '=가상고' }); expect(school.f).toBeUndefined();
  const zip = CFB.read(bytes, { type: 'array' });
  const xml = new TextDecoder().decode(CFB.find(zip, '/xl/worksheets/sheet1.xml').content);
  expect(xml).toContain('xSplit="6" ySplit="6" topLeftCell="G7"');
  expect(xml).toContain('showGridLines="0"');
  expect(xml).toContain('<row r="7" ht="56" customHeight="1"');
  expect(xml).toContain('<autoFilter ref="A6:BK9"');
  expect(xml).toMatch(/<c r="G7"[^>]* s="6"/);
  expect(xml).toMatch(/<c r="H7"[^>]* s="8"/);
  expect(xml).toMatch(/<c r="I7"[^>]* s="7"/);
  const styles = new TextDecoder().decode(CFB.find(zip, '/xl/styles.xml').content);
  expect(styles).toContain('FFE6F3EB'); expect(styles).toContain('FFFCEBED');
});

it('동적 파일 생성 후 범위 검사가 실패하면 다운로드를 시작하지 않는다', async () => {
  const createObjectURL = vi.spyOn(URL, 'createObjectURL');
  await expect(downloadFileWorkbook(buildFileWorkbook(fixture(), { kind: 'class', classKey: '1-1-10' }, now), () => { throw new Error('범위 변경'); })).rejects.toThrow('범위 변경');
  expect(createObjectURL).not.toHaveBeenCalled(); createObjectURL.mockRestore();
});
