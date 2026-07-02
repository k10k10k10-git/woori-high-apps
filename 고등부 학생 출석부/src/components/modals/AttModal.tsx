'use client';
import type { AttEditTarget } from '@/types';
import { useApp } from '@/store/AppContext';

type Props = {
  target: AttEditTarget;
  currentVal: string;
  onSelect: (val: string) => void;
  onClose: () => void;
};

export default function AttModal({ target, currentVal, onSelect, onClose }: Props) {
  const { state } = useApp();
  const { months, classData } = state;

  const ck = target.ck;
  const [mi, di] = target.k.split('-').map(Number);
  const month = months[mi]?.month ?? '';
  const day = months[mi]?.sundays[di] ?? '';
  const student = classData[ck]?.students.find(s => s.id === target.sid);

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label={`${student?.name} ${month}월 ${day}일 출석 입력`}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title" style={{ fontSize: 14, marginBottom: 8 }}>
          {student?.name} · {month}월 {day}일
        </div>
        <div className="att-modal-btns">
          {(['O', 'X', 'T'] as const).map(v => (
            <button
              key={v}
              className={`att-modal-btn ${v}${currentVal === v ? ' selected' : ''}`}
              style={currentVal === v ? { outline: '3px solid currentColor' } : {}}
              onClick={() => onSelect(v)}
              aria-label={`${student?.name} ${v === 'O' ? '출석' : v === 'X' ? '결석' : '지각'} 처리`}
              aria-pressed={currentVal === v}
            >
              {v === 'O' ? '출석' : v === 'X' ? '결석' : '지각'}
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
