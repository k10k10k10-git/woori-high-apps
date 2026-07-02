'use client';
import { useState } from 'react';
import { ref, set, update } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { useApp, useClassKeys, useClassKey } from '@/store/AppContext';
import { sortAndRenumber } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import ClassTabBar from '@/components/ClassTabBar';
import StudentModal from '@/components/modals/StudentModal';
import TeacherModal from '@/components/modals/TeacherModal';
import RosterModal from '@/components/modals/RosterModal';
import AddClassModal from '@/components/modals/AddClassModal';
import MoveStudentModal from '@/components/modals/MoveStudentModal';
import TrashModal from '@/components/modals/TrashModal';
import type { MoveTarget } from '@/types';

export default function ManageTab() {
  const { state, dispatch } = useApp();
  const { curPart, curGrade, curClass, curYear, classData, userRole } = state;
  const classKeys = useClassKeys(state);
  const ck = useClassKey(state);
  const students = classData[ck]?.students ?? [];
  const isAdmin = !userRole || userRole.role === 'admin';
  const teacher = classData[ck]?.teacher ?? '';
  const teacherPhoto = classData[ck]?.teacherPhoto ?? '';
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function deleteClass() {
    if (!isAdmin) return;
    setDeleteConfirm(false);
    const keys = classKeys.filter(k => k !== ck);
    const classInfo = classData[ck];
    try {
      await update(ref(db), {
        [`trash/${curYear}/classes/${ck.replace(/-/g, '_')}`]: {
          ck,
          teacher: classInfo?.teacher ?? '',
          teacherPhoto: classInfo?.teacherPhoto ?? null,
          students: Object.fromEntries((classInfo?.students ?? []).map(s => [s.id, s])),
          deletedAt: Date.now(),
        },
        [`classes/${curYear}/${ck}`]: null,
        [`attendance/${curYear}/${ck}`]: null,
      });
      if (keys.length > 0) {
        dispatch({ type: 'SET_CLASS', payload: keys[0].split('-')[2] });
      }
    } catch {
      showToast('반 삭제에 실패했습니다. 다시 시도해 주세요.');
    }
  }

  return (
    <div className="manage-container">
      {/* 반 탭 */}
      <ClassTabBar />

      {/* 교사 카드 (관리자만) */}
      {isAdmin && (
        <div className="teacher-card">
          {teacherPhoto ? (
            <img src={teacherPhoto} alt="교사" className="teacher-photo" style={{ width: 48, height: 48 }} />
          ) : (
            <div className="teacher-photo">👤</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {teacher || '담당 교사 미설정'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {curPart}부 {curGrade}학년 {curClass}반 담당
            </div>
          </div>
          <button className="edit-btn" onClick={() => dispatch({ type: 'OPEN_TEACHER_MODAL' })} aria-label="담당 교사 정보 수정">
            수정
          </button>
        </div>
      )}

      {/* 관리자 버튼 */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            style={{ flex: '0 0 auto', padding: '8px 16px', fontSize: 12 }}
            onClick={() => dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: null } })}
          >
            + 학생 추가
          </button>
          <button
            className="btn-secondary"
            style={{ flex: '0 0 auto', padding: '8px 16px', fontSize: 12 }}
            onClick={() => dispatch({ type: 'OPEN_ROSTER_MODAL' })}
          >
            명단 일괄 입력
          </button>
          <button
            className="btn-secondary"
            style={{ flex: '0 0 auto', padding: '8px 16px', fontSize: 12 }}
            onClick={() => dispatch({ type: 'OPEN_ADD_CLASS_MODAL' })}
          >
            + 반 추가
          </button>
          {classKeys.length > 1 && (
            <button
              className="btn-danger"
              style={{ flex: '0 0 auto', padding: '8px 16px', fontSize: 12 }}
              onClick={() => setDeleteConfirm(true)}
            >
              반 삭제
            </button>
          )}
          <button
            className="btn-secondary"
            style={{ flex: '0 0 auto', padding: '8px 16px', fontSize: 12 }}
            onClick={() => setTrashOpen(true)}
          >
            🗑 최근 삭제
          </button>
        </div>
      )}

      {/* 반 삭제 확인 */}
      {deleteConfirm && (
        <div style={{
          margin: '0 0 10px',
          padding: '12px 14px',
          background: 'var(--red-bg)',
          border: '1.5px solid var(--red)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--red-text)', marginBottom: 8 }}>
            {curPart}부 {curGrade}학년 {curClass}반을 삭제할까요?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
            출석 데이터도 함께 삭제됩니다. 최근 삭제 목록에 7일간 보관됩니다.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-danger" style={{ padding: '6px 14px', fontSize: 12 }} onClick={deleteClass}>삭제</button>
            <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setDeleteConfirm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 학생 목록 */}
      <div className="student-list">
        {students.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px', fontSize: 13 }}>
            등록된 학생이 없습니다.
          </div>
        ) : (
          students.map(student => (
            <div key={student.id} className="student-card">
              <div className="student-num">{student.num}</div>
              {student.photo ? (
                <img src={student.photo} alt={student.name} className="student-photo" style={{ width: 40, height: 40 }} />
              ) : (
                <div className="student-photo">{student.name.charAt(0)}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="student-name">{student.name}</div>
                <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
                  <tbody>
                    {([
                      ['생년월일',   student.birth],
                      ['학생 연락처', student.phone],
                      ['부모 연락처', student.pphone],
                      ['학교',       student.school],
                      ['주소',       student.addr],
                    ] as [string, string | undefined][]).map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ fontSize: 11, color: 'var(--text3)', paddingRight: 10, whiteSpace: 'nowrap', verticalAlign: 'top', lineHeight: '1.7' }}>{label}</td>
                        <td style={{ fontSize: 11, color: val ? 'var(--text2)' : 'var(--text3)', lineHeight: '1.7' }}>{val || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="edit-btn"
                    onClick={() => dispatch({ type: 'OPEN_STUDENT_MODAL', payload: { editId: student.id } })}
                  >
                    수정
                  </button>
                  <button
                    className="edit-btn"
                    onClick={() => setMoveTarget({ sid: student.id, fromCk: ck })}
                  >
                    이동
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 모달들 */}
      {state.studentModal.open && (
        <StudentModal
          editId={state.studentModal.editId}
          onClose={() => dispatch({ type: 'CLOSE_STUDENT_MODAL' })}
        />
      )}
      {state.teacherModal.open && (
        <TeacherModal onClose={() => dispatch({ type: 'CLOSE_TEACHER_MODAL' })} />
      )}
      {state.rosterModal && (
        <RosterModal onClose={() => dispatch({ type: 'CLOSE_ROSTER_MODAL' })} />
      )}
      {state.addClassModal && (
        <AddClassModal onClose={() => dispatch({ type: 'CLOSE_ADD_CLASS_MODAL' })} />
      )}
      {moveTarget && (
        <MoveStudentModal
          target={moveTarget}
          onClose={() => setMoveTarget(null)}
        />
      )}
      {trashOpen && (
        <TrashModal onClose={() => setTrashOpen(false)} />
      )}
    </div>
  );
}
