'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { db, ref, set, push, onValue, off } from '@/lib/db';
import { useApp, useClassKey, calcStats } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import { downloadCSV, downloadXLSX, openPrintWindow } from '@/utils/export';
import { activeAndLongAbsentStudents, recentEditableWeeks } from '@/utils/attendanceWorkflow';
import ClassTabBar from '@/components/ClassTabBar';
import AttModal from '@/components/modals/AttModal';
import HistoryModal from '@/components/modals/HistoryModal';
import type { AttEditTarget, ViewKey } from '@/types';

export default function AttendanceTab() {
  const { state, dispatch } = useApp();
  const { curYear, months, events, attData, classData, curView } = state;
  const ck = useClassKey(state);
  const students = useMemo(() => classData[ck]?.students ?? [], [classData, ck]);
  const { active: activeStudents, longAbsent: longAbsentStudents } = useMemo(
    () => activeAndLongAbsentStudents(students),
    [students],
  );
  const isTeacher = state.userRole?.role === 'teacher';
  const [attSubView, setAttSubView] = useState<'check' | 'table' | 'suggest'>('check');

  // ── 건의사항 ──
  type Suggestion = { id: string; text: string; createdAt: number; author: string };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestText, setSuggestText] = useState('');
  const [suggestSaving, setSuggestSaving] = useState(false);

  useEffect(() => {
    if (attSubView !== 'suggest') return;
    const sugRef = ref(db, `suggestions/${curYear}/${ck}`);
    onValue(sugRef, snap => {
      if (!snap.exists()) { setSuggestions([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = Object.entries(snap.val() as Record<string, any>).map(([id, v]: [string, any]) => ({ id, ...v } as Suggestion));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setSuggestions(list);
    });
    return () => off(sugRef);
  }, [attSubView, curYear, ck]);

  async function handleSuggestSubmit() {
    if (!suggestText.trim()) return;
    setSuggestSaving(true);
    const teacher = classData[ck]?.teacher ?? '';
    try {
      await push(ref(db, `suggestions/${curYear}/${ck}`), {
        text: suggestText.trim(),
        createdAt: Date.now(),
        author: teacher,
      });
      setSuggestText('');
      showToast('건의사항이 등록되었습니다.');
    } catch {
      showToast('저장에 실패했습니다.');
    }
    setSuggestSaving(false);
  }
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [sortByName, setSortByName] = useState(false);

  const editableWeeks = useMemo(
    () => recentEditableWeeks(curYear, months, events, Date.now(), 4),
    [curYear, months, events],
  );
  const [pickedWeekKey, setPickedWeekKey] = useState('');
  const selectedWeek = editableWeeks.find(week => week.key === pickedWeekKey) ?? editableWeeks[0] ?? null;
  const selectedWeekKey = selectedWeek?.key ?? null;

  type SaveFeedback = {
    status: 'saving' | 'saved' | 'error';
    sid: string;
    studentName: string;
    target: AttEditTarget;
    value: string;
    savedAt?: number;
  };
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);

  const displayStudents = sortByName
    ? [...activeStudents].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    : activeStudents;

  const checkedCount = useMemo(() =>
    displayStudents.filter(s => selectedWeekKey && !!(attData[ck]?.[s.id]?.[selectedWeekKey])).length,
    [displayStudents, selectedWeekKey, attData, ck]
  );

  // 현재 반의 총 학생 수, 주차 수 등 통계
  const totalStudents = activeStudents.length;
  const allWeeks = months.flatMap(({ sundays }, mi) =>
    sundays.map((_, di) => evKey(mi, di))
  ).filter(k => !events[k]);

  const viewWeeks = useMemo(() => allWeeks.filter(k => {
    const [mi] = k.split('-').map(Number);
    const month = months[mi]?.month ?? 0;
    if (curView === 'first') return month >= 1 && month <= 6;
    if (curView === 'second') return month >= 7 && month <= 12;
    return true;
  }), [allWeeks, curView, months]);

  const avgRate = useMemo(() => {
    if (totalStudents === 0) return 0;
    const statsArr = activeStudents.map(s => calcStats(state, ck, s.id)).filter(st => (st.present + st.absent + st.tardy) > 0);
    if (statsArr.length === 0) return 0;
    const sum = statsArr.reduce((acc, st) => {
      const rec = st.present + st.absent + st.tardy;
      return acc + Math.round((st.present / rec) * 100);
    }, 0);
    return Math.round(sum / statsArr.length);
  }, [totalStudents, activeStudents, state, ck]);

  const teacher = classData[ck]?.teacher ?? '';

  // 이번 주 출석/지각/결석/미입력 카운트
  const selectedWeekStats = useMemo(() => {
    if (!selectedWeekKey) {
      return { O: 0, T: 0, X: 0, empty: displayStudents.length };
    }
    let O = 0, T = 0, X = 0, empty = 0;
    displayStudents.forEach(s => {
      const val = attData[ck]?.[s.id]?.[selectedWeekKey] ?? '';
      if (val === 'O') O++;
      else if (val === 'T') T++;
      else if (val === 'X') X++;
      else empty++;
    });
    return { O, T, X, empty };
  }, [displayStudents, selectedWeekKey, attData, ck]);

  function onCellClick(sid: string, k: string) {
    dispatch({ type: 'OPEN_ATT_MODAL', payload: { ck, sid, k } });
  }

  async function saveAttendance(target: AttEditTarget, value: string) {
    const studentName = classData[target.ck]?.students?.find(student => student.id === target.sid)?.name ?? '학생';
    setSaveFeedback({ status: 'saving', sid: target.sid, studentName, target, value });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    const path = `attendance/${curYear}/${target.ck}/${target.sid}/${target.k}`;
    try {
      await set(ref(db, path), value === '' ? null : value);
      setSaveFeedback({ status: 'saved', sid: target.sid, studentName, target, value, savedAt: Date.now() });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    } catch {
      setSaveFeedback({ status: 'error', sid: target.sid, studentName, target, value });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' });
      showToast('출석 저장에 실패했습니다. 아래 재시도 버튼을 눌러 주세요.');
    }
  }

  async function handleQuickCheck(sid: string, val: string) {
    if (!selectedWeekKey) return;
    const current = attData[ck]?.[sid]?.[selectedWeekKey] ?? '';
    const newVal = current === val ? '' : val;
    await saveAttendance({ ck, sid, k: selectedWeekKey }, newVal);
  }

  async function handleAttChange(target: AttEditTarget, value: string) {
    dispatch({ type: 'CLOSE_ATT_MODAL' });
    await saveAttendance(target, value);
  }

  function exportCSV() {
    const header = ['번호', '이름', ...viewWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      return `${months[mi]?.month}/${months[mi]?.sundays[di]}`;
    })];
    const rows = [header, ...activeStudents.map(s => [
      String(s.num ?? ''),
      s.name,
      ...viewWeeks.map(k => attData[ck]?.[s.id]?.[k] ?? ''),
    ])];
    downloadCSV(rows, `출석_${curYear}_${ck}.csv`);
    setExportOpen(false);
  }

  async function exportXLSX() {
    const header = ['번호', '이름', ...viewWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      return `${months[mi]?.month}/${months[mi]?.sundays[di]}`;
    })];
    const rows = [header, ...activeStudents.map(s => [
      String(s.num ?? ''),
      s.name,
      ...viewWeeks.map(k => attData[ck]?.[s.id]?.[k] ?? ''),
    ])];
    await downloadXLSX(rows, '출석', `출석_${curYear}_${ck}.xlsx`);
    setExportOpen(false);
  }

  function exportPDF() {
    setExportOpen(false);
    const PAGE_SIZE = 10;
    const pages: typeof activeStudents[] = [];
    for (let i = 0; i < activeStudents.length; i += PAGE_SIZE) pages.push(activeStudents.slice(i, i + PAGE_SIZE));
    if (pages.length === 0) return;

    // PDF용 주차: 이벤트 포함, 학기 필터만 적용
    const pdfWeeks = months.flatMap(({ sundays }, mi) =>
      sundays.map((_, di) => evKey(mi, di))
    ).filter(k => {
      const [mi] = k.split('-').map(Number);
      const month = months[mi]?.month ?? 0;
      if (curView === 'first')  return month >= 1 && month <= 6;
      if (curView === 'second') return month >= 7 && month <= 12;
      return true;
    });

    // 월 헤더 span 계산 (pdfWeeks 기준 — 이벤트 포함)
    const monthSpans: { month: number; span: number }[] = [];
    months.forEach(({ month, sundays }, mi) => {
      const vis = sundays.filter((_, di) => {
        const m = months[mi].month;
        if (curView === 'first'  && !(m >= 1 && m <= 6))  return false;
        if (curView === 'second' && !(m >= 7 && m <= 12)) return false;
        return true; // 이벤트 포함
      });
      if (vis.length > 0) monthSpans.push({ month, span: vis.length });
    });

    const monthHdr = monthSpans.map(ms =>
      `<th colspan="${ms.span}" style="background:#F2EFF9;color:#6B5AAF;font-weight:700;">${ms.month}월</th>`
    ).join('');

    const dayHdr = pdfWeeks.map(k => {
      const [mi, di] = k.split('-').map(Number);
      const day = months[mi]?.sundays[di];
      const ev = events[k];
      return ev
        ? `<th style="background:#fef3c7;color:#92400e;font-size:6pt;word-break:keep-all;">${ev}</th>`
        : `<th style="background:#f8fafc;">${day ?? ''}</th>`;
    }).join('');

    // ck 예: "1-1-1" → "1부 1학년 1반"
    const [ckPart, ckGrade, ckClass] = ck.split('-');
    const ckLabel = `${ckPart}부 ${ckGrade}학년 ${ckClass}반`;

    const pagesHTML = pages.map((group, pi) => {
      const isLast = pi === pages.length - 1;
      const rows = group.map(s => {
        const stats = calcStats(state, ck, s.id);
        const rec = stats.present + stats.absent + stats.tardy;
        const rate = rec > 0 ? Math.round((stats.present / rec) * 100) : 0;
        const grade = rate >= 90 ? 'A' : rate >= 80 ? 'B' : rate >= 70 ? 'C' : 'D';
        const cells = pdfWeeks.map(k => {
          const ev = events[k];
          const val = attData[ck]?.[s.id]?.[k] ?? '';
          if (ev) return `<td style="background:#fef3c7;color:#92400e;font-size:6pt;word-break:keep-all;">${ev}</td>`;
          const bg = val === 'O' ? '#ecfdf5' : val === 'X' ? '#fef2f2' : val === 'T' ? '#fffbeb' : '';
          const fg = val === 'O' ? '#059669' : val === 'X' ? '#dc2626' : val === 'T' ? '#d97706' : '';
          return `<td style="background:${bg};color:${fg};font-weight:${val ? '700' : '400'};">${val}</td>`;
        }).join('');
        return `<tr class="data-row">
          <td style="color:#94a3b8;text-align:center;">${s.num ?? ''}</td>
          <td style="text-align:left;padding:3px 6px;font-weight:500;">${s.name}</td>
          ${cells}
          <td style="background:#f8fafc;">${rec > 0 ? `${stats.present}/${rec}` : '-'}</td>
          <td style="background:#f8fafc;">${rec > 0 ? rate + '%' : '-'}</td>
          <td style="background:#f8fafc;">${rec > 0 ? grade : '-'}</td>
        </tr>`;
      }).join('');
      return `<div ${isLast ? '' : 'style="page-break-after:always;"'}>
        <div style="font-size:10pt;font-weight:700;margin-bottom:5px;">${curYear}년 ${ckLabel} 출석부 &nbsp;${pi + 1}페이지</div>
        <table><thead>
          <tr>
            <th rowspan="2" style="background:#f8fafc;">순</th>
            <th rowspan="2" style="background:#f8fafc;">이름</th>
            ${monthHdr}
            <th rowspan="2" style="background:#f8fafc;">출석/주차</th>
            <th rowspan="2" style="background:#f8fafc;">출석률</th>
            <th rowspan="2" style="background:#f8fafc;">등급</th>
          </tr>
          <tr>${dayHdr}</tr>
        </thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join('');

    const ok = openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        *{box-sizing:border-box;}
        body{font-family:sans-serif;font-size:9pt;margin:0;padding:0;}
        @page{size:landscape;margin:6mm;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #e2e8f0;padding:3px 4px;text-align:center;white-space:nowrap;font-size:8pt;}
        thead{display:table-header-group;}
        tr.data-row{height:17mm;}
      </style></head><body>
      ${pagesHTML}
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
    </body></html>`);
    if (!ok) showToast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해 주세요.');
  }

  // 달력 헤더 렌더
  const headerCols: React.ReactNode[] = [];
  months.forEach(({ month, sundays }, mi) => {
    if (sundays.length === 0) return;
    const visibleSundays = sundays.filter((_, di) => {
      const k = evKey(mi, di);
      const monthNum = months[mi].month;
      if (curView === 'first' && !(monthNum >= 1 && monthNum <= 6)) return false;
      if (curView === 'second' && !(monthNum >= 7 && monthNum <= 12)) return false;
      return true;
    });
    if (visibleSundays.length === 0) return;
    headerCols.push(
      <th key={`m-${mi}`} colSpan={visibleSundays.length} className="att-header-month">
        {month}월
      </th>
    );
  });

  const headerDays: React.ReactNode[] = [];
  months.forEach(({ month, sundays }, mi) => {
    sundays.forEach((day, di) => {
      const monthNum = months[mi].month;
      if (curView === 'first' && !(monthNum >= 1 && monthNum <= 6)) return;
      if (curView === 'second' && !(monthNum >= 7 && monthNum <= 12)) return;
      const k = evKey(mi, di);
      const ev = events[k];
      headerDays.push(
        <th key={k} className={ev ? 'att-header-holiday' : 'att-header-cell'}>
          {day}
        </th>
      );
    });
  });

  return (
    <div>
      {/* 반 탭 */}
      <ClassTabBar />

      {/* 출석 체크 / 출석부 / 건의사항 서브탭 */}
      <div className="view-btn-row" style={{ paddingBottom: 0 }} role="tablist" aria-label="출석 서브 탭">
        <button role="tab" aria-selected={attSubView === 'check'} className={`view-btn${attSubView === 'check' ? ' active' : ''}`} onClick={() => setAttSubView('check')}>출석 체크</button>
        <button role="tab" aria-selected={attSubView === 'table'} className={`view-btn${attSubView === 'table' ? ' active' : ''}`} onClick={() => setAttSubView('table')}>출석부</button>
        <button role="tab" aria-selected={attSubView === 'suggest'} className={`view-btn${attSubView === 'suggest' ? ' active' : ''}`} onClick={() => setAttSubView('suggest')}>건의사항</button>
      </div>

      {/* 통계 카드 */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-card-label">일반 출석 학생</div>
          <div className="stat-card-value">{totalStudents}명</div>
        </div>
        {state.userRole?.role !== 'teacher' && (
          <div className="stat-card">
            <div className="stat-card-label">주차</div>
            <div className="stat-card-value">{viewWeeks.length}주</div>
          </div>
        )}
        {state.userRole?.role !== 'teacher' && (
          <div className="stat-card">
            <div className="stat-card-label">평균 출석률</div>
            <div className="stat-card-value">{avgRate}%</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-card-label">담당 교사</div>
          <div className="stat-card-value" style={{ fontSize: 13 }}>{teacher || '-'}</div>
        </div>
      </div>

      {/* ── 출석 체크 뷰 ── */}
      {attSubView === 'check' && (
        <>
          <div className="attendance-week-picker">
            <label htmlFor="attendance-week">출석 날짜</label>
            <select
              id="attendance-week"
              value={selectedWeekKey ?? ''}
              onChange={event => setPickedWeekKey(event.target.value)}
              disabled={editableWeeks.length === 0}
            >
              {editableWeeks.length === 0 ? (
                <option value="">입력 가능한 주일이 없습니다</option>
              ) : editableWeeks.map(week => (
                <option key={week.key} value={week.key}>{week.label}</option>
              ))}
            </select>
            <span>담임 교사는 최근 4회의 출석을 확인하고 바로 수정할 수 있습니다.</span>
          </div>

          {/* 이번 주 요약 카드 */}
          {selectedWeekKey && activeStudents.length > 0 && (
            <div className="week-summary-row">
              <div className="week-summary-card green">
                <div className="week-summary-icon">✓</div>
                <div className="week-summary-count">{selectedWeekStats.O}</div>
                <div className="week-summary-label">출석</div>
              </div>
              <div className="week-summary-card amber">
                <div className="week-summary-icon">△</div>
                <div className="week-summary-count">{selectedWeekStats.T}</div>
                <div className="week-summary-label">지각</div>
              </div>
              <div className="week-summary-card red">
                <div className="week-summary-icon">✕</div>
                <div className="week-summary-count">{selectedWeekStats.X}</div>
                <div className="week-summary-label">결석</div>
              </div>
              <div className="week-summary-card gray">
                <div className="week-summary-icon">○</div>
                <div className="week-summary-count">{selectedWeekStats.empty}</div>
                <div className="week-summary-label">미입력</div>
              </div>
            </div>
          )}

          {/* 출석 체크 리스트 */}
          <div className="check-list-wrap">
            <div className="check-list-header">
              {selectedWeekKey ? (
                <>
                  <span className="check-week-label">{selectedWeek?.label}</span>
                  <span className="check-progress">{checkedCount} / {displayStudents.length}명 완료</span>
                </>
              ) : (
                <span className="check-week-label" style={{ color: 'var(--text3)' }}>
                  입력 가능한 출석 날짜가 없습니다
                </span>
              )}
            </div>
            {activeStudents.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px', fontSize: 14 }}>
                일반 출석 대상 학생이 없습니다.
              </div>
            ) : (
              <div className="check-list">
                {displayStudents.map(student => {
                  const val = selectedWeekKey ? (attData[ck]?.[student.id]?.[selectedWeekKey] ?? '') : '';
                  const rowCls = val === 'O' ? ' row-o' : val === 'T' ? ' row-t' : val === 'X' ? ' row-x' : '';
                  return (
                    <div key={student.id} className={`check-row${rowCls}`}>
                      <div className="check-student-info"
                        onClick={() => dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: student.id, ck } })}>
                        {student.photo ? (
                          <img src={student.photo} alt={student.name} className="check-avatar-img" />
                        ) : (
                          <div className="check-avatar">{student.name.charAt(0)}</div>
                        )}
                        <span className="check-name">{student.name}</span>
                        {saveFeedback?.sid === student.id && (
                          <span className={`attendance-row-save ${saveFeedback.status}`}>
                            {saveFeedback.status === 'saving' ? '저장 중' : saveFeedback.status === 'saved' ? '저장됨' : '저장 실패'}
                          </span>
                        )}
                      </div>
                      <div className="check-btns">
                        {(['O', 'T', 'X'] as const).map(v => (
                          <button
                            key={v}
                            className={`check-btn ${v}${val === v ? ' active' : ''}`}
                            onClick={() => selectedWeekKey && handleQuickCheck(student.id, v)}
                            disabled={!selectedWeekKey || saveFeedback?.status === 'saving'}
                          >
                            {v === 'O' ? '출석' : v === 'T' ? '지각' : '결석'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </>
      )}

      {/* ── 건의사항 뷰 ── */}
      {attSubView === 'suggest' && (
        <div style={{ padding: '12px' }}>
          {isTeacher && (
            <div className="suggest-form-card">
              <div className="suggest-form-title">건의사항 작성</div>
              <textarea
                className="suggest-textarea"
                value={suggestText}
                onChange={e => setSuggestText(e.target.value)}
                placeholder="교역자 또는 부서에 전달할 내용을 작성해주세요..."
                rows={4}
              />
              <button
                className="suggest-submit-btn"
                onClick={handleSuggestSubmit}
                disabled={!suggestText.trim() || suggestSaving}
              >
                {suggestSaving ? '등록 중...' : '등록하기'}
              </button>
            </div>
          )}
          {/* 관리자만 목록 표시 */}
          {!isTeacher && (
            <>
              <div className="suggest-list-header">
                {classData[ck]?.teacher || ''} 교사 건의사항
                <span className="suggest-count">{suggestions.length}건</span>
              </div>
              {suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px', fontSize: 14 }}>
                  등록된 건의사항이 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map(s => (
                    <div key={s.id} className="suggest-item">
                      <div className="suggest-item-meta">
                        {new Date(s.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric', month: 'long', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {s.author && ` · ${s.author}`}
                      </div>
                      <div className="suggest-item-text">{s.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 출석부 테이블 뷰 ── */}
      {attSubView === 'table' && <>
      {/* 뷰 + 정렬 + 내보내기 */}
      <div className="view-btn-row">
        {(['first', 'second', 'all'] as ViewKey[]).map(v => (
          <button
            key={v}
            className={`view-btn${curView === v ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: v })}
          >
            {v === 'first' ? '1학기' : v === 'second' ? '2학기' : '전체'}
          </button>
        ))}
        <button
          className={`view-btn${sortByName ? ' active' : ''}`}
          onClick={() => setSortByName(s => !s)}
          title="이름 가나다 순으로 정렬"
        >
          가나다순
        </button>
        <div className="export-wrap" ref={exportRef}>
          <button className="export-btn" onClick={() => setExportOpen(o => !o)} aria-label="출석부 내보내기 메뉴 열기">
            내보내기 &#9662;
          </button>
          {exportOpen && (
            <div className="export-menu">
              <button onClick={exportCSV}>CSV 다운로드</button>
              <button onClick={exportXLSX}>Excel 다운로드</button>
              <button onClick={exportPDF}>PDF 인쇄</button>
            </div>
          )}
        </div>
      </div>

      {/* 출석 테이블 */}
      <div className="att-table-wrap">
        {activeStudents.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px', fontSize: 13 }}>
            일반 출석 대상 학생이 없습니다.
          </div>
        ) : (
          <table className="att-table">
            <thead>
              <tr>
                <th className="att-header-cell" style={{ minWidth: 28 }}>순</th>
                <th className="att-header-name" style={{ textAlign: 'center', minWidth: 72 }}>사진/이름</th>
                {headerCols}
                <th className="att-header-cell" style={{ background: 'var(--surface2)' }}>출석/주차</th>
                <th className="att-header-cell" style={{ background: 'var(--surface2)' }}>출석률</th>
                <th className="att-header-cell" style={{ background: 'var(--surface2)' }}>등급</th>
              </tr>
              <tr>
                <th className="att-header-cell"></th>
                <th className="att-header-name"></th>
                {headerDays}
                <th className="att-header-cell"></th>
                <th className="att-header-cell"></th>
                <th className="att-header-cell"></th>
              </tr>
            </thead>
            <tbody>
              {displayStudents.map(student => {
                const stats = calcStats(state, ck, student.id);
                const recorded = stats.present + stats.absent + stats.tardy;
                const effectiveRate = recorded > 0 ? Math.round((stats.present / recorded) * 100) : 0;
                const grade = effectiveRate >= 90 ? 'A' : effectiveRate >= 80 ? 'B' : effectiveRate >= 70 ? 'C' : 'D';
                const gradeColor = grade === 'A' ? '#10b981' : grade === 'B' ? '#9B8DD4' : grade === 'C' ? '#f59e0b' : '#ef4444';
                const rateClass = effectiveRate >= 90 ? 'att-rate-good' : effectiveRate >= 80 ? '' : effectiveRate >= 60 ? 'att-rate-warn' : recorded > 0 ? 'att-rate-bad' : '';
                return (
                  <tr key={student.id}>
                    <td className="att-stat-cell" style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                      {student.num}
                    </td>
                    <td
                      className="att-cell-name"
                      style={{ textAlign: 'center', padding: '6px 8px', verticalAlign: 'middle' }}
                      onClick={() => dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: student.id, ck } })}
                    >
                      {student.photo ? (
                        <img src={student.photo} alt={student.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 3px' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'var(--primary)', margin: '0 auto 3px' }}>
                          {student.name.charAt(0)}
                        </div>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{student.name}</div>
                    </td>
                    {months.map(({ month, sundays }, mi) =>
                      sundays.map((_, di) => {
                        const monthNum = months[mi].month;
                        if (curView === 'first' && !(monthNum >= 1 && monthNum <= 6)) return null;
                        if (curView === 'second' && !(monthNum >= 7 && monthNum <= 12)) return null;
                        const k = evKey(mi, di);
                        const ev = events[k];
                        const val = attData[ck]?.[student.id]?.[k] ?? '';
                        if (ev) {
                          return (
                            <td key={k} className="att-cell holiday">
                              <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', display: 'inline-block', fontSize: 8, overflow: 'hidden', maxHeight: 60, whiteSpace: 'nowrap', lineHeight: 1.1, color: '#92400e' }}>
                                {ev}
                              </span>
                            </td>
                          );
                        }
                        const teacherCanEdit = editableWeeks.some(week => week.key === k);
                        const canEdit = !isTeacher || teacherCanEdit;
                        return (
                          <td
                            key={k}
                            className={`att-cell${val ? ' ' + val : ''}${canEdit ? '' : ' readonly'}`}
                            onClick={canEdit ? () => onCellClick(student.id, k) : undefined}
                            title={isTeacher && !teacherCanEdit ? '최근 4회 출석만 수정할 수 있습니다' : undefined}
                          >
                            {val}
                          </td>
                        );
                      })
                    )}
                    <td className="att-stat-cell">
                      {recorded > 0 ? `${stats.present}/${recorded}` : '-'}
                    </td>
                    <td className={`att-stat-cell${rateClass ? ' ' + rateClass : ''}`}>
                      {recorded > 0 ? effectiveRate + '%' : '-'}
                    </td>
                    <td className="att-stat-cell">
                      {recorded > 0 ? (
                        <span style={{ padding: '2px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: gradeColor + '22', color: gradeColor }}>
                          {grade}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </> }

      {attSubView !== 'suggest' && longAbsentStudents.length > 0 && (
        <details className="long-absent-panel">
          <summary>
            <span>장결자 {longAbsentStudents.length}명</span>
            <small>기본 출석 대상과 통계에서 분리됨</small>
          </summary>
          <div className="long-absent-list">
            {longAbsentStudents.map(student => (
              <button
                type="button"
                key={student.id}
                onClick={() => dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: student.id, ck } })}
              >
                <strong>{student.name}</strong>
                <span>출석 이력 보기 →</span>
              </button>
            ))}
          </div>
        </details>
      )}

      {saveFeedback && attSubView !== 'suggest' && (
        <div className={`attendance-save-banner ${saveFeedback.status}`} role="status" aria-live="polite">
          <span>
            {saveFeedback.status === 'saving' && `${saveFeedback.studentName} 출석을 저장하고 있습니다.`}
            {saveFeedback.status === 'saved' && `${saveFeedback.studentName} 출석이 저장되었습니다.`}
            {saveFeedback.status === 'error' && `${saveFeedback.studentName} 출석을 저장하지 못했습니다.`}
          </span>
          {saveFeedback.status === 'error' && (
            <button type="button" onClick={() => saveAttendance(saveFeedback.target, saveFeedback.value)}>재시도</button>
          )}
        </div>
      )}

      {/* 출석 모달 */}
      {state.attModal.open && state.attModal.target && (
        <AttModal
          target={state.attModal.target}
          currentVal={attData[state.attModal.target.ck]?.[state.attModal.target.sid]?.[state.attModal.target.k] ?? ''}
          onSelect={val => handleAttChange(state.attModal.target!, val)}
          onClose={() => dispatch({ type: 'CLOSE_ATT_MODAL' })}
        />
      )}

      {/* 학생 이력 모달 */}
      {state.historyModal.open && state.historyModal.sid && (
        <HistoryModal
          sid={state.historyModal.sid}
          curCk={state.historyModal.ck ?? undefined}
          onClose={() => dispatch({ type: 'CLOSE_HISTORY_MODAL' })}
        />
      )}
    </div>
  );
}
