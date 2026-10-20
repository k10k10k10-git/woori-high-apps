import { sortReportStudents, type buildPastoralReport, type ReportSort } from './pastoralReport';

export type ContactExportKind = 'absent' | 'recovered';
export type PastoralReportData = ReturnType<typeof buildPastoralReport>;

function excelDate(dateValue: number): Date {
  const date = new Date(dateValue);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** 화면 검색·반·장결 필터를 적용하지 않고 기준 주일의 전체 대상을 내보낸다. */
export function pastoralContactWorkbook(report: PastoralReportData, year: number, kind: ContactExportKind, order: ReportSort) {
  if (!report.selectedWeek) throw new Error('조회할 기준 주일이 없습니다.');
  const students = sortReportStudents(kind === 'absent' ? report.absent : report.recovered, order);
  const label = kind === 'absent' ? '연속 결석' : '다시 출석';
  const missing = students.filter(row => !row.student.phone?.trim()).length;
  const date = new Date(report.selectedWeek.dateValue).toISOString().slice(0, 10);
  const rows: (string | number | Date)[][] = [
    [`${year}년 ${label} 학생 연락처`],
    [`기준 주일: ${date}`],
    [`전체 ${students.length}명 · 본인 연락처 미등록 ${missing}명 · 장결 포함 · 검색·부서·학년·반 필터 미적용`],
    [kind === 'absent' ? '기준 주일부터 확인된 3회 이상 연속 결석. 행사 제외, 출석·미입력에서 연속 계산 중단.' : '3회 이상 연속 결석 후 기준 주일에 다시 출석. 결석 횟수는 복귀 직전의 확인된 연속 결석.'],
    [],
    ['학생 이름', '본인 연락처', '소속 반', '장결 구분', kind === 'absent' ? '연속 결석 횟수' : '복귀 전 연속 결석 횟수', '마지막 출석일', '보호자 연락처'],
    ...students.map(row => {
      let streak = row.streak;
      if (kind === 'recovered') {
        streak = 0;
        for (const cell of row.recent.slice(1)) { if (cell.value !== 'X') break; streak++; }
      }
      return [row.student.name.trim() || '미등록', row.student.phone?.trim() || '미등록', row.label,
        row.student.jang ? '장결' : '일반', streak, row.lastPresent ? excelDate(row.lastPresent.dateValue) : '기록 없음', row.student.pphone?.trim() || '미등록'];
    }),
  ];
  return { rows, label, count: students.length, filename: `${label.replace(/ /g, '')}_전체연락처_${date}.xlsx` };
}
