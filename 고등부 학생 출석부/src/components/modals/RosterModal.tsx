'use client';
import { useState } from 'react';
import { ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { useApp, useClassKey } from '@/store/AppContext';
import { sortAndRenumber } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import type { Student } from '@/types';

function parseRosterLines(lines: string[]): Partial<Student>[] {
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split(/[,\t]/);
      return {
        id: `s_${Date.now()}_${i}`,
        name: parts[0]?.trim() ?? '',
        birth: parts[1]?.trim() ?? '',
        phone: parts[2]?.trim() ?? '',
      };
    })
    .filter(s => s.name);
}

export default function RosterModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const ck = useClassKey(state);
  const [tab, setTab] = useState<'text' | 'csv'>('text');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Partial<Student>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState(false);

  function preview() {
    const lines = text.split('\n');
    setParsed(parseRosterLines(lines));
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      const lines = content.split('\n').slice(1); // 헤더 제거
      setParsed(parseRosterLines(lines));
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleApply() {
    if (parsed.length === 0) { showToast('학생 데이터가 없습니다.'); return; }
    setApplyConfirm(true);
  }

  async function doApply() {
    setApplyConfirm(false);
    setSaving(true);
    try {
      const base = Date.now();
      const students = sortAndRenumber(
        parsed.map((s, i) => ({ id: `s_${base}_${i}_${Math.random().toString(36).slice(2, 6)}`, name: s.name ?? '', birth: s.birth, phone: s.phone }))
      );
      const obj: Record<string, unknown> = {};
      students.forEach(s => { obj[s.id] = s; });
      await set(ref(db, `classes/${state.curYear}/${ck}/students`), obj);
    } catch {
      showToast('적용에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="명단 일괄 입력">
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">명단 일괄 입력</div>

        <div className="roster-tabs">
          {(['text', 'csv'] as const).map(t => (
            <button
              key={t}
              className={`roster-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'text' ? '텍스트 입력' : 'CSV 파일'}
            </button>
          ))}
        </div>

        {tab === 'text' ? (
          <div>
            <textarea
              className="form-input"
              rows={8}
              placeholder={'이름, 생년월일, 연락처\n예: 홍길동, 2010-01-01, 010-0000-0000'}
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
            <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={preview}>
              미리보기
            </button>
          </div>
        ) : (
          <div
            className={`csv-drop-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleCsvFile(file);
            }}
            onClick={() => document.getElementById('csv-input')?.click()}
          >
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
            />
            📂 CSV 파일을 여기에 드롭하거나 클릭하여 선택
          </div>
        )}

        {parsed.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
              미리보기 ({parsed.length}명)
            </div>
            <div className="roster-preview">
              {parsed.map((s, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  {i + 1}. {s.name} {s.birth && `(${s.birth})`}
                </div>
              ))}
            </div>
          </div>
        )}

        {applyConfirm && (
          <div style={{
            margin: '10px 0 0',
            padding: '12px 14px',
            background: 'var(--red-bg)',
            border: '1.5px solid var(--red)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--red-text)', marginBottom: 8 }}>
              명단을 교체할까요?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
              기존 학생 {state.classData[ck]?.students.length ?? 0}명이 삭제되고 {parsed.length}명으로 교체됩니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-danger" style={{ padding: '6px 14px', fontSize: 12 }} onClick={doApply} disabled={saving}>교체</button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setApplyConfirm(false)}>취소</button>
            </div>
          </div>
        )}
        <div className="btn-row">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button
            className="btn-primary"
            onClick={handleApply}
            disabled={parsed.length === 0 || saving || applyConfirm}
          >
            {saving ? '적용 중...' : `${parsed.length}명으로 교체`}
          </button>
        </div>
      </div>
    </div>
  );
}
