'use client';
// 데모 첫 화면 — 부서·학년·반을 골라 그 반 담임처럼 들어간다.
// 목록은 교사 계정 명단(userRoles)에서 만들고, 비어 있으면 반 목록(classes/{year})으로 대체한다.
import { useEffect, useMemo, useState } from 'react';
import { db, ref, get } from '@/lib/db';
import { getKSTYear } from '@/utils/dates';
import {
  buildDemoOptionsFromClasses, buildDemoOptionsFromRoles,
  loadLastDemoSelection,
  type DemoOption, type DemoSelection,
} from '@/lib/demo';
import type { UserRole } from '@/types';
import AdminIcon from '@/components/admin/AdminIcon';

export default function DemoClassPicker({
  onPick,
  onAdminLogin,
  signInError,
}: {
  onPick: (sel: DemoSelection) => void;
  onAdminLogin: () => void;
  signInError?: string | null;
}) {
  const [options, setOptions] = useState<DemoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [part, setPart] = useState('1');
  const [grade, setGrade] = useState('1');
  const [cls, setCls] = useState('');
  const [lastSelection, setLastSelection] = useState<DemoSelection | null>(null);

  useEffect(() => setLastSelection(loadLastDemoSelection()), []);

  useEffect(() => {
    if (signInError) return; // 로그인 자체가 실패하면 읽기도 실패한다 — 헛된 요청을 보내지 않는다
    let alive = true;
    (async () => {
      try {
        const snap = await get(ref(db, 'userRoles'));
        let collected = buildDemoOptionsFromRoles(
          snap.exists() ? (snap.val() as Record<string, UserRole>) : null);
        // 교사 계정이 아직 없는 반도 고를 수 있어야 한다 — 반 목록으로 보충한다.
        if (collected.length === 0) {
          const classSnap = await get(ref(db, `classes/${getKSTYear()}`));
          collected = buildDemoOptionsFromClasses(
            classSnap.exists() ? (classSnap.val() as Record<string, { teacher?: string }>) : null);
        }
        // 교사 계정에 이름이 비어 있는 경우가 많다 — 반 노드의 담임 이름으로 채운다.
        // 반 전체 트리는 사진 때문에 무거우므로 teacher 문자열 하나씩만 읽는다.
        const withNames = await Promise.all(collected.map(async o => {
          if (o.teacherName) return o;
          try {
            const snap = await get(ref(db, `classes/${getKSTYear()}/${o.ck}/teacher`));
            return snap.exists() ? { ...o, teacherName: String(snap.val()) } : o;
          } catch {
            return o; // 이름은 거들 뿐 — 실패해도 반은 고를 수 있어야 한다
          }
        }));
        if (!alive) return;
        setOptions(withNames);
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setOptions([]);
      }
    })();
    return () => { alive = false; };
  }, [signInError]);

  const parts = useMemo(
    () => [...new Set((options ?? []).map(o => o.part))].sort(),
    [options]);
  const effectivePart = parts.includes(part) ? part : (parts[0] ?? part);
  const grades = useMemo(
    () => [...new Set((options ?? []).filter(o => o.part === effectivePart).map(o => o.grade))].sort(),
    [options, effectivePart]);
  const effectiveGrade = grades.includes(grade) ? grade : (grades[0] ?? grade);
  const classesInGrade = useMemo(
    () => (options ?? []).filter(o => o.part === effectivePart && o.grade === effectiveGrade),
    [options, effectivePart, effectiveGrade]);

  // 기본값(1부·1학년)이 실제 목록에 없거나 상위 선택을 바꿔도 유효한 하위 값을 보여야 한다.
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
              <span>관리자 계정으로 접근</span>
              <AdminIcon name="arrow" size={14} />
            </button>
          </div>
        </div>
      </header>

      <main id="entry-main" className="entry-main" tabIndex={-1}>
        <section className="entry-panel" aria-labelledby="demo-picker-title">
          <div className="entry-intro">
            <h1 id="demo-picker-title">고등부 출석부</h1>
            <p>담당하시는 반을 선택해 주세요</p>
          </div>

          <div className="entry-notice" id="demo-data-notice">
            <strong>실제 자료 안내</strong>
            <span>테스트용 화면입니다. 선택한 반의 실제 출석 자료가 보이고, 입력한 내용은 실제로 저장됩니다.</span>
          </div>

          {signInError ? (
            <div className="entry-error" role="alert">{signInError}</div>
          ) : options === null ? (
            <div className="entry-loading" role="status" aria-live="polite">
              <div className="spinner" />
              <span>반 목록을 불러오는 중입니다</span>
            </div>
          ) : (
            <>
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

              {loadError && (
                <div className="entry-error" role="alert">반 목록을 불러오지 못했습니다: {loadError}</div>
              )}
              {!loadError && options.length === 0 && (
                <div className="entry-error" role="alert">
                  등록된 반이 없습니다. 관리자 계정으로 접속해 확인해 주세요.
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
