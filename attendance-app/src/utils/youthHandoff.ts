import { calcStats, type AppState } from '@/store/AppContext';
import { attendanceGrade } from './attendanceHistory';
import { reportDate } from './pastoralReport';
import type { Student } from '@/types';

export const YOUTH_HANDOFF_COLUMNS = ['학생 이름', '생년월일', '본인 전화번호', '학부모 연락처', '학교', '주소', '출석률', '출석등급'];
type HandoffSource = Pick<AppState, 'curYear' | 'classData' | 'attData' | 'months' | 'events'>;

export function handoffBirth(value?: string): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '미등록';
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})\.?$/.exec(raw);
  const normalized = match ? `${match[1]}-${match[2]}-${match[3]}` : raw;
  return reportDate(normalized) !== null ? normalized : `확인 필요 (${raw})`;
}

/** 현재 명단을 그대로 포함한다. 장결·미입력·동명이인을 제외하거나 자동 병합하지 않는다. */
export function buildYouthHandoff(source: HandoffSource, nowMs = Date.now()) {
  const extractedOn = new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const startsOn = `${source.curYear}-01-01`;
  const endsOn = extractedOn < `${source.curYear}-12-31` ? extractedOn : `${source.curYear}-12-31`;
  const futureYear = extractedOn < startsOn;
  // 월/주일 배열의 원래 인덱스는 출석 키이므로 월을 제거하거나 재번호하지 않는다.
  const months = source.months.map(entry => ({ ...entry, sundays: entry.sundays.filter(day => `${source.curYear}-${String(entry.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` <= endsOn) }));
  const annualSource = { ...source, months, curView: 'all' as const };
  const rows = Object.entries(source.classData).flatMap(([classKey, info]) => {
    if (!/^[12]-3-[1-9]\d*$/.test(classKey)) return [];
    return info.students.map(student => {
      const { present, absent, rate } = calcStats(annualSource, classKey, student.id);
      const recorded = present + absent;
      return { classKey, student, birth: handoffBirth(student.birth), rate: recorded ? rate : null, grade: recorded ? attendanceGrade(rate) : '산정 불가' };
    });
  }).sort((a, b) => a.student.name.localeCompare(b.student.name, 'ko') || a.classKey.localeCompare(b.classKey, 'ko', { numeric: true }) || a.student.id.localeCompare(b.student.id));
  const missingFields = (student: Student) => [student.name, student.birth, student.phone, student.pphone, student.school, student.addr].some(value => !value?.trim());
  return { year: source.curYear, extractedOn, startsOn, endsOn, futureYear, rows,
    firstPartCount: rows.filter(row => row.classKey.startsWith('1-')).length,
    secondPartCount: rows.filter(row => row.classKey.startsWith('2-')).length,
    reviewCount: rows.filter(row => missingFields(row.student) || row.birth.startsWith('확인 필요')).length,
    unratedCount: rows.filter(row => row.rate === null).length,
  };
}

export type YouthHandoff = ReturnType<typeof buildYouthHandoff>;
export function youthHandoffCells(row: YouthHandoff['rows'][number]): (string | number | Date)[] {
  const [year, month, day] = row.birth.split('-').map(Number);
  // Excel의 날짜 직렬화는 로컬 달력일을 사용하므로 UTC 자정으로 만들지 않는다.
  return [row.student.name.trim() || '미등록', reportDate(row.birth) !== null ? new Date(year, month - 1, day) : row.birth,
    row.student.phone?.trim() || '미등록', row.student.pphone?.trim() || '미등록', row.student.school?.trim() || '미등록', row.student.addr?.trim() || '미등록',
    row.rate === null ? '산정 불가' : row.rate / 100, row.grade];
}

export function youthHandoffWorkbookRows(report: YouthHandoff): (string | number | Date)[][] {
  return [
    [`${report.year}년 고3 청년부 인계 명단`],
    [`출석 조회 기간: ${report.startsOn} ~ ${report.endsOn} · 추출일: ${report.extractedOn}`],
    [`전체 ${report.rows.length}명 · 1부 ${report.firstPartCount}명 · 2부 ${report.secondPartCount}명 · 장결 학생 포함`],
    ['출석률 = 출석 / 입력된 출석·결석 기록 (행사·미입력 제외). 등급 A ≥ 90%, B ≥ 80%, C ≥ 70%, D < 70%. 기록 없음은 산정 불가.'],
    [], YOUTH_HANDOFF_COLUMNS,
    ...report.rows.map(youthHandoffCells),
  ];
}
