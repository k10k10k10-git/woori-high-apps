'use client';
import { useMemo, useState } from 'react';
import { getKSTYear, getSundaysForYear } from '@/utils/dates';
import { recentEditableWeeks } from '@/utils/attendanceWorkflow';
import type { AttValue } from '@/types';
import type { DemoSelection } from '@/lib/demo';
import AdminIcon from '@/components/admin/AdminIcon';
import './demo-attendance.css';

const STUDENTS = Array.from({ length: 8 }, (_, index) => ({
  id: `sample-${index + 1}`,
  name: `가상 학생 ${index + 1}`,
}));

type DemoAttendanceData = Record<string, Record<string, AttValue>>;

function sampleAttendance(weekKeys: string[]): DemoAttendanceData {
  return Object.fromEntries(STUDENTS.map((student, studentIndex) => [student.id,
    Object.fromEntries(weekKeys.slice(1).map((week, weekIndex) => [
      week, (studentIndex + weekIndex) % 5 === 0 ? 'X' : 'O',
    ])),
  ]));
}

export default function DemoAttendance({ selection, onChangeClass, onAdminLogin }: {
  selection: DemoSelection;
  onChangeClass: () => void;
  onAdminLogin: () => void;
}) {
  const year = getKSTYear();
  const weeks = useMemo(() => recentEditableWeeks(year, getSundaysForYear(year), {}, Date.now()), [year]);
  const [attendance, setAttendance] = useState<DemoAttendanceData>(() => sampleAttendance(weeks.map(week => week.key)));
  const [selectedWeekKey, setSelectedWeekKey] = useState(weeks[0]?.key ?? '');
  const [tab, setTab] = useState<'check' | 'table'>('check');
  const selectedWeek = weeks.find(week => week.key === selectedWeekKey);
  const checked = STUDENTS.filter(student => attendance[student.id]?.[selectedWeekKey]).length;
  const present = STUDENTS.filter(student => attendance[student.id]?.[selectedWeekKey] === 'O').length;
  const absent = STUDENTS.filter(student => attendance[student.id]?.[selectedWeekKey] === 'X').length;
  const [part, grade, cls] = selection.ck.split('-');

  function toggle(studentId: string, value: Exclude<AttValue, ''>) {
    if (!selectedWeek) return;
    setAttendance(previous => {
      const existing = previous[studentId] ?? {};
      return { ...previous, [studentId]: { ...existing, [selectedWeek.key]: existing[selectedWeek.key] === value ? '' : value } };
    });
  }

  return <div className="app teacher-workspace demo-workspace">
    <a className="teacher-skip" href="#demo-main">본문으로 이동</a>
    <header className="topbar">
      <div className="topbar-main">
        <div className="topbar-title"><span className="topbar-title-mark" aria-hidden="true"><AdminIcon name="book" size={17} /></span><span>출석부</span><span className="demo-badge">데모</span></div>
        <div className="topbar-actions">
          <button className="logout-btn" type="button" onClick={onChangeClass}>반 바꾸기</button>
          <button className="logout-btn topbar-admin-btn" type="button" onClick={onAdminLogin}>관리자 접근</button>
        </div>
      </div>
    </header>
    <main id="demo-main" className="content-area" tabIndex={-1}>
      <div className="teacher-attendance">
        <div className="demo-heading"><div><p className="demo-eyebrow">가상 체험</p><h1>{part}부 {grade}학년 {cls}반 출석부</h1></div><span>학생 {STUDENTS.length}명</span></div>
        <div className="entry-notice" role="note"><strong>체험 자료</strong><span>실제 학생 정보와 연결되지 않습니다. 입력은 이 화면에만 반영되며 새로고침하면 초기화됩니다.</span></div>
        <div className="view-btn-row attendance-subtabs" role="tablist" aria-label="데모 출석 메뉴">
          <button type="button" className={`view-btn${tab === 'check' ? ' active' : ''}`} role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>출석 체크</button>
          <button type="button" className={`view-btn${tab === 'table' ? ' active' : ''}`} role="tab" aria-selected={tab === 'table'} onClick={() => setTab('table')}>출석부 조회</button>
        </div>
        {tab === 'check' ? <section className="attendance-tab-panel" role="tabpanel">
          <div className="demo-week-toolbar"><label htmlFor="demo-week">출석 날짜</label><select id="demo-week" value={selectedWeekKey} onChange={event => setSelectedWeekKey(event.target.value)}>{weeks.map(week => <option key={week.key} value={week.key}>{year}년 {week.label}</option>)}</select></div>
          <div className="demo-summary" role="status" aria-live="polite"><span><strong>{checked}</strong> / {STUDENTS.length}명 입력</span><span>출석 {present}명</span><span>결석 {absent}명</span></div>
          <div className="check-list-wrap"><div className="check-list-header"><span className="check-week-label">가상 학생 명단</span><span className="check-progress">{selectedWeek?.label ?? '날짜 없음'}</span></div><div className="check-list">
            {STUDENTS.map(student => { const value = attendance[student.id]?.[selectedWeekKey] ?? ''; return <div className={`check-row${value === 'O' ? ' row-o' : value === 'X' ? ' row-x' : ''}`} key={student.id}>
              <span className="check-student-info"><span className="check-avatar" aria-hidden="true">가</span><span className="check-name">{student.name}</span></span>
              <div className="check-btns">{(['O', 'X'] as const).map(option => <button type="button" key={option} className={`check-btn ${option}${value === option ? ' active' : ''}`} aria-label={`${student.name} ${option === 'O' ? '출석' : '결석'}`} aria-pressed={value === option} disabled={!selectedWeek} onClick={() => toggle(student.id, option)}>{option === 'O' ? '출석' : '결석'}</button>)}</div>
            </div>; })}
          </div></div>
        </section> : <section className="attendance-tab-panel" role="tabpanel"><div className="demo-table-wrap"><table className="demo-table"><caption>최근 4회 가상 출석 기록</caption><thead><tr><th scope="col">학생</th>{weeks.map(week => <th scope="col" key={week.key}>{week.label}</th>)}</tr></thead><tbody>{STUDENTS.map(student => <tr key={student.id}><th scope="row">{student.name}</th>{weeks.map(week => <td key={week.key}>{attendance[student.id]?.[week.key] === 'O' ? '출석' : attendance[student.id]?.[week.key] === 'X' ? '결석' : '미입력'}</td>)}</tr>)}</tbody></table></div></section>}
      </div>
    </main>
  </div>;
}
