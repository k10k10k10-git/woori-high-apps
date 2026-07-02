'use client';

import { useApp } from '@/store/AppContext';
import { saveAttToFirebase } from '@/hooks/useFirebaseData';
import type { AttEditTarget, AttValue } from '@/types';

const VALUES: { v: AttValue; label: string; cls: string }[] = [
  { v: 'O', label: '출석', cls: 'att-o' },
  { v: 'X', label: '결석', cls: 'att-x' },
  { v: 'T', label: '지각', cls: 'att-t' },
  { v: '',  label: '미기록', cls: 'att-empty' },
];

export default function AttModal({
  target,
  onClose,
  validWeeks,
}: {
  target: AttEditTarget;
  onClose: () => void;
  validWeeks: { key: string; label: string }[];
}) {
  const { state, dispatch } = useApp();
  const { curYear, attData, groupData } = state;
  const { gk, mid, k } = target;
  const member = groupData[gk]?.members.find(m => m.id === mid);
  const weekLabel = validWeeks.find(w => w.key === k)?.label ?? k;
  const cur = (attData[gk]?.[mid]?.[k] ?? '') as AttValue;

  function handleSelect(v: AttValue) {
    saveAttToFirebase(
      curYear, gk, mid, k, v,
      () => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' }),
      () => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }),
    );
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{member?.name ?? mid}</div>
        <div className="modal-sub">{weekLabel}</div>
        <div className="att-choice-row">
          {VALUES.map(({ v, label, cls }) => (
            <button
              key={v}
              className={`att-choice-btn ${cls}${cur === v ? ' selected' : ''}`}
              onClick={() => handleSelect(v)}
            >
              <span className="choice-val">{v || '–'}</span>
              <span className="choice-label">{label}</span>
            </button>
          ))}
        </div>
        <button className="modal-btn cancel" onClick={onClose} style={{ marginTop: '0.5rem' }}>닫기</button>
      </div>
    </div>
  );
}
