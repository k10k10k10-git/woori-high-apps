import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, useApp } from '@/store/AppContext';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import PastoralReport from '@/components/admin/PastoralReport';
import { recentEditableWeeks } from '@/utils/attendanceWorkflow';
import type { AttData, ClassDataMap } from '@/types';
import { fixture } from './mocks';
import '@/app/globals.css';

function Preview() {
  const { state, dispatch } = useApp();
  useEffect(() => {
    dispatch({ type: 'SET_USER_ROLE', payload: { role: new URLSearchParams(location.search).has('teacher') ? 'teacher' : 'admin', name: '합성 관리자' } });
  }, [dispatch]);
  useEffect(() => {
    const weeks = recentEditableWeeks(state.curYear, state.months, {}, Date.now(), 8);
    const students = ['가상 가람', '가상 나래', '가상 다온', '가상 라온'].map((name, i) => ({ id: `nf_${i}`, personId: `person_${i}`, name, phone: '010-0000-0000', pphone: '010-0000-0000', jang: i === 3 }));
    const classes: ClassDataMap = { '1-1-1': { teacher: '가상 담임', students }, '2-2-1': { teacher: '가상 교사', students: [{ id: 's2', name: '가상 마루' }] } };
    const attendance: AttData = { '1-1-1': {} };
    students.forEach((student, i) => {
      attendance['1-1-1'][student.id] = Object.fromEntries(weeks.map((week, j) => [week.key, i === 0 || i === 3 ? j < 4 ? 'X' : 'O' : i === 1 ? j === 0 || j > 3 ? 'O' : 'X' : j === 1 ? '' : 'O']));
      fixture.friends[String(i)] = { name: student.name, part: '1부', grade: 1, owner: '가상 담당', registeredDate: weeks.at(-1) ? new Date(weeks.at(-1)!.dateValue).toISOString().slice(0, 10) : '', rosterSync: { studentId: student.id, classKey: '1-1-1', personId: student.personId } };
    });
    dispatch({ type: 'SET_CLASS_DATA', revision: state.dataRevision, payload: classes });
    dispatch({ type: 'SET_ATT_DATA', revision: state.dataRevision, payload: attendance });
  }, [dispatch, state.curYear, state.dataRevision, state.months]);
  return <><p style={{ padding: 8, background: '#eeecf5', color: '#584a97' }}>합성 데이터 검증 화면 · 운영 연결 없음</p><AdminWorkspace isOnline onLogout={() => {}}><PastoralReport /></AdminWorkspace></>;
}
createRoot(document.getElementById('root')!).render(<AppProvider><Preview /></AppProvider>);
