'use client';
import { useRef } from 'react';
import type { AttEditTarget, AttValue } from '@/types';
import { useApp } from '@/store/AppContext';
import { ATTENDANCE_OPTIONS } from '@/utils/attendanceValue';
import { useModalFocus } from '@/hooks/useModalFocus';

type Props = {
  target: AttEditTarget;
  currentVal: AttValue;
  onSelect: (val: AttValue) => void;
  onClose: () => void;
};

export default function AttModal({ target, currentVal, onSelect, onClose }: Props) {
  const { state } = useApp();
  const { months, classData } = state;
  const isTeacher = state.userRole?.role === 'teacher';
  const sheetRef = useRef<HTMLDivElement>(null);
  const initialOptionRef = useRef<HTMLButtonElement>(null);

  const ck = target.ck;
  const [mi, di] = target.k.split('-').map(Number);
  const month = months[mi]?.month ?? '';
  const day = months[mi]?.sundays[di] ?? '';
  const student = classData[ck]?.students.find(s => s.id === target.sid);

  useModalFocus({ containerRef: sheetRef, initialFocusRef: initialOptionRef, onDismiss: onClose });

  return (
    <div className={`modal-overlay${isTeacher ? ' teacher-attendance-modal' : ''}`} onClick={onClose}
      role="dialog" aria-modal="true" aria-label={`${student?.name} ${month}월 ${day}일 출석 입력`}>
      <div ref={sheetRef} className="modal-sheet" onClick={e => e.stopPropagation()} tabIndex={-1}>
        <div className="modal-handle-area" aria-hidden="true"><div className="modal-handle" /></div>
        <div className="att-modal-header">
          <div className="modal-title">
            {student?.name} · {month}월 {day}일
          </div>
          <button type="button" className="att-modal-close" onClick={onClose}>닫기</button>
        </div>
        <div className="att-modal-btns">
          {ATTENDANCE_OPTIONS.map(v => (
            <button
              ref={v === (currentVal || ATTENDANCE_OPTIONS[0]) ? initialOptionRef : undefined}
              key={v}
              className={`att-modal-btn ${v}${currentVal === v ? ' selected' : ''}`}
              style={currentVal === v ? { outline: '3px solid currentColor' } : {}}
              onClick={() => onSelect(v)}
              aria-label={`${student?.name} ${v === 'O' ? '출석' : '결석'} 처리`}
              aria-pressed={currentVal === v}
            >
              {v === 'O' ? '출석' : '결석'}
            </button>
          ))}
          <button
            className="att-modal-btn clear"
            onClick={() => onSelect('')}
            aria-label="출석 상태 초기화"
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
}
