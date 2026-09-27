'use client';
// 데모 첫 화면 — 실제 반/교사/학생 정보를 조회하지 않는다.
import { useEffect, useMemo, useState } from 'react';
import {
  DEMO_OPTIONS, loadLastDemoSelection, type DemoSelection,
} from '@/lib/demo';
import AdminIcon from '@/components/admin/AdminIcon';

export default function DemoClassPicker({
  onPick,
  onAdminLogin,
}: {
  onPick: (sel: DemoSelection) => void;
  onAdminLogin: () => void;
}) {
  const [part, setPart] = useState('1');
  const [grade, setGrade] = useState('1');
  const [cls, setCls] = useState('');
  const [lastSelection, setLastSelection] = useState<DemoSelection | null>(null);

  useEffect(() => setLastSelection(loadLastDemoSelection()), []);

  const parts = useMemo(
    () => [...new Set(DEMO_OPTIONS.map(o => o.part))].sort(), []);
  const effectivePart = parts.includes(part) ? part : (parts[0] ?? part);
  const grades = useMemo(
    () => [...new Set(DEMO_OPTIONS.filter(o => o.part === effectivePart).map(o => o.grade))].sort(),
    [effectivePart]);
  const effectiveGrade = grades.includes(grade) ? grade : (grades[0] ?? grade);
  const classesInGrade = useMemo(
    () => DEMO_OPTIONS.filter(o => o.part === effectivePart && o.grade === effectiveGrade),
    [effectivePart, effectiveGrade]);

  // 상위 선택을 바꿔도 유효한 하위 값을 바로 보여 준다.
  // effect에서 setState로 고치지 않고 렌더 중에 파생한다(선택 상태를 effect가 덮는 사고 방지).
  const effectiveCls = classesInGrade.some(o => o.cls === cls)
    ? cls
    : (classesInGrade[0]?.cls ?? '');
  const selected = classesInGrade.find(o => o.cls === effectiveCls) ?? null;

  return (
    <div className="attendance-entry attendance-entry--demo">
      <a className="entry-skip" href="#entry-main">본문으로 이동</a>
      <header className="entry-header">
        <div className="entry-header-inner">
          <div className="entry-brand">
            <span className="entry-brand-mark"><AdminIcon name="book" size={18} /></span>
            <span>출석부</span>
          </div>
          <div className="entry-header-actions">
            <span className="entry-mode">데모 테스트</span>
            <button type="button" className="entry-secondary-action" onClick={onAdminLogin}>
              <span>실제 출석부 로그인</span>
              <AdminIcon name="arrow" size={14} />
            </button>
          </div>
        </div>
      </header>

      <main id="entry-main" className="entry-main" tabIndex={-1}>
        <section className="entry-panel" aria-labelledby="demo-picker-title">
          <div className="entry-intro">
            <h1 id="demo-picker-title">고등부 출석부</h1>
            <p>체험할 가상 반을 선택해 주세요</p>
          </div>

          <div className="entry-notice" id="demo-data-notice">
            <strong>가상 자료 안내</strong>
            <span>가상 명단으로 체험합니다. 실제 학생 자료를 조회하지 않으며 입력 내용은 운영 출석부에 저장되지 않습니다.</span>
          </div>

              {lastSelection && (
                <button
                  type="button"
                  className="entry-recent"
                  onClick={() => onPick(lastSelection)}
                >
                  <AdminIcon name="clock" size={17} />
                  <span className="entry-recent-copy">
                    <strong>최근 선택한 반</strong>
                    <small>{lastSelection.ck.split('-').map((v, i) => `${v}${i === 0 ? '부' : i === 1 ? '학년' : '반'}`).join(' ')}</small>
                  </span>
                  <span className="entry-recent-action">
                    바로 들어가기
                    <AdminIcon name="arrow" size={14} />
                  </span>
                </button>
              )}

              <form
                className="entry-form"
                aria-describedby="demo-data-notice"
                onSubmit={e => {
                  e.preventDefault();
                  if (selected) onPick({ ck: selected.ck, teacherName: selected.teacherName });
                }}
              >
                <fieldset>
                  <legend className="entry-sr-only">담당 반 선택</legend>
                  <div className="entry-field">
                    <label htmlFor="demo-part">부서</label>
                    <select id="demo-part" className="entry-input" value={effectivePart} onChange={e => setPart(e.target.value)}>
                      {(parts.length > 0 ? parts : ['1', '2']).map(p => (
                        <option key={p} value={p}>{p}부</option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-field">
                    <label htmlFor="demo-grade">학년</label>
                    <select id="demo-grade" className="entry-input" value={effectiveGrade} onChange={e => setGrade(e.target.value)}>
                      {(grades.length > 0 ? grades : ['1', '2', '3']).map(g => (
                        <option key={g} value={g}>{g}학년</option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-field">
                    <label htmlFor="demo-class">반</label>
                    <select
                      id="demo-class"
                      className="entry-input"
                      value={effectiveCls}
                      onChange={e => setCls(e.target.value)}
                      disabled={classesInGrade.length === 0}
                    >
                      {classesInGrade.length === 0 ? (
                        <option value="">선택할 반이 없습니다</option>
                      ) : (
                        classesInGrade.map(o => (
                          <option key={o.ck} value={o.cls}>
                            {o.cls}반{o.teacherName ? ` · ${o.teacherName} 선생님` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </fieldset>

                {selected && (
                  <div className="entry-selection-summary" aria-live="polite">
                    <span>현재 선택</span>
                    <strong>{selected.part}부 {selected.grade}학년 {selected.cls}반</strong>
                    {selected.teacherName ? <small>{selected.teacherName} 선생님</small> : null}
                  </div>
                )}

                <button className="entry-primary-action" type="submit" disabled={!selected}>
                  이 반으로 들어가기
                  <AdminIcon name="arrow" size={15} />
                </button>
              </form>

        </section>
      </main>
    </div>
  );
}
