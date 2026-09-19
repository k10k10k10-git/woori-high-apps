'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp, useClassKey, calcStats } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { attendanceExport } from '@/utils/attendanceExport';
import { activeAndLongAbsentStudents } from '@/utils/attendanceWorkflow';
import { buildAttendanceEntry } from '@/utils/attendanceEntry';
import { ATTENDANCE_OPTIONS } from '@/utils/attendanceValue';
import { useSuggestions } from '@/hooks/useSuggestions';
import { useVisitRequests } from '@/hooks/useVisitRequests';
import { useAttendanceSave } from '@/hooks/useAttendanceSave';
import ClassTabBar from '@/components/ClassTabBar';
import AttendanceSaveBanner from '@/components/AttendanceSaveBanner';
import AdminIcon from '@/components/admin/AdminIcon';
import AttModal from '@/components/modals/AttModal';
import HistoryModal from '@/components/modals/HistoryModal';
import type { AttEditTarget, AttValue, ViewKey } from '@/types';

const ATTENDANCE_SUBVIEWS = [
  { key: 'check', label: '출석 체크' },
  { key: 'table', label: '출석부' },
  { key: 'suggest', label: '특이사항' },
  { key: 'visit', label: '심방 요청' },
] as const;

type AttendanceSubView = typeof ATTENDANCE_SUBVIEWS[number]['key'];

export default function AttendanceTab() {
  const { state, dispatch } = useApp();
  const { curYear, months, events, attData, classData, curView } = state;
  const requestedWeekKey = useSearchParams().get('week');
  const ck = useClassKey(state);
  const students = useMemo(() => classData[ck]?.students ?? [], [classData, ck]);
  const { active: activeStudents, longAbsent: longAbsentStudents } = useMemo(
    () => activeAndLongAbsentStudents(students),
    [students],
  );
  const isTeacher = state.userRole?.role === 'teacher';
  const [attSubView, setAttSubView] = useState<AttendanceSubView>('check');

  const { suggestions, suggestStudentId, setSuggestStudentId, suggestText, setSuggestText, suggestSaving, suggestLoadError, handleSuggestSubmit } =
    useSuggestions(curYear, ck, attSubView === 'suggest' && !isTeacher, classData[ck]?.teacher ?? '');
  const suggestStudent = students.find(student => student.id === suggestStudentId);
  const {
    visitRequests, visitStudentId, setVisitStudentId, visitText, setVisitText,
    visitSaving, visitLoadError, handleVisitSubmit,
  } = useVisitRequests(curYear, ck, attSubView === 'visit', classData[ck]?.teacher ?? '');
  const visitStudent = students.find(student => student.id === visitStudentId);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [sortByName, setSortByName] = useState(false);

  useEffect(() => {
    if (!exportOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExportOpen(false);
      exportButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [exportOpen]);

  const [pickedWeek, setPickedWeek] = useState<{ year: number; requestKey: string | null; key: string } | null>(null);
  const pickedWeekKey = pickedWeek?.year === curYear && pickedWeek.requestKey === requestedWeekKey
    ? pickedWeek.key : null;
  const { editableWeeks, selectedWeek } = useMemo(
    () => buildAttendanceEntry({ curYear, months, events, userRole: state.userRole }, {
      queryWeekKey: requestedWeekKey, pickedWeekKey,
    }),
    [curYear, months, events, state.userRole, requestedWeekKey, pickedWeekKey],
  );
  const selectedWeekKey = selectedWeek?.key ?? null;

  const { feedback: saveFeedback, save: saveAttendance, dismissSaved: dismissSavedFeedback, pending: attendanceSaving } = useAttendanceSave();

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
    const statsArr = activeStudents.map(s => calcStats(state, ck, s.id)).filter(st => (st.present + st.absent) > 0);
    if (statsArr.length === 0) return 0;
    const sum = statsArr.reduce((acc, st) => {
      const rec = st.present + st.absent;
      return acc + Math.round((st.present / rec) * 100);
    }, 0);
    return Math.round(sum / statsArr.length);
  }, [totalStudents, activeStudents, state, ck]);

  const teacher = classData[ck]?.teacher ?? '';

  // 이번 주 출석/결석/미입력 카운트
  const selectedWeekStats = useMemo(() => {
    if (!selectedWeekKey) {
      return { O: 0, X: 0, empty: displayStudents.length };
    }
    let O = 0, X = 0, empty = 0;
    displayStudents.forEach(s => {
      const val = attData[ck]?.[s.id]?.[selectedWeekKey] ?? '';
      if (val === 'O') O++;
      else if (val === 'X') X++;
      else empty++;
    });
    return { O, X, empty };
  }, [displayStudents, selectedWeekKey, attData, ck]);

  function onCellClick(sid: string, k: string) {
    dispatch({ type: 'OPEN_ATT_MODAL', payload: { ck, sid, k } });
  }

  async function handleQuickCheck(sid: string, val: Exclude<AttValue, ''>) {
    if (!selectedWeekKey) return;
    const current = attData[ck]?.[sid]?.[selectedWeekKey] ?? '';
    const newVal = current === val ? '' : val;
    await saveAttendance({ ck, sid, k: selectedWeekKey }, newVal);
  }

  async function handleAttChange(target: AttEditTarget, value: AttValue) {
    dispatch({ type: 'CLOSE_ATT_MODAL' });
    await saveAttendance(target, value);
  }

  const { exportCSV, exportXLSX, exportPDF } = attendanceExport(state, ck, activeStudents, viewWeeks, () => setExportOpen(false));

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
      <th key={`m-${mi}`} scope="colgroup" colSpan={visibleSundays.length} className="att-header-month">
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
        <th key={k} scope="col" className={ev ? 'att-header-holiday' : 'att-header-cell'}>
          {day}
        </th>
      );
    });
  });

  return (
    <div className={isTeacher ? 'teacher-attendance' : undefined}>
      {/* 반 탭 */}
      {isTeacher ? (
        <div className="attendance-class-context">
          <ClassTabBar />
          <p className="attendance-class-count">
            <span>출석 대상</span>
            <strong>{totalStudents}</strong>
            <span>명</span>
          </p>
        </div>
      ) : <ClassTabBar />}

      {/* 출석 체크 / 출석부 / 특이사항 / 심방 요청 서브탭 */}
      <div className="view-btn-row attendance-subtabs" role="tablist" aria-label="출석 서브 탭">
        {ATTENDANCE_SUBVIEWS.map((view, index) => (
          <button
            key={view.key}
            id={`attendance-tab-${view.key}`}
            type="button"
            role="tab"
            aria-selected={attSubView === view.key}
            aria-controls={attSubView === view.key ? `attendance-panel-${view.key}` : undefined}
            tabIndex={attSubView === view.key ? 0 : -1}
            className={`view-btn${attSubView === view.key ? ' active' : ''}`}
            onClick={() => setAttSubView(view.key)}
            onKeyDown={event => {
              let nextIndex = index;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % ATTENDANCE_SUBVIEWS.length;
              else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + ATTENDANCE_SUBVIEWS.length) % ATTENDANCE_SUBVIEWS.length;
              else if (event.key === 'Home') nextIndex = 0;
              else if (event.key === 'End') nextIndex = ATTENDANCE_SUBVIEWS.length - 1;
              else return;

              event.preventDefault();
              const nextView = ATTENDANCE_SUBVIEWS[nextIndex];
              setAttSubView(nextView.key);
              requestAnimationFrame(() => document.getElementById(`attendance-tab-${nextView.key}`)?.focus());
            }}
          >
            {view.label}
          </button>
        ))}
      </div>

      {/* 통계 카드 */}
      {!isTeacher && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-card-label">일반 출석 학생</div>
            <div className="stat-card-value">{totalStudents}명</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">주차</div>
            <div className="stat-card-value">{viewWeeks.length}주</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">평균 출석률</div>
            <div className="stat-card-value">{avgRate}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">담당 교사</div>
            <div className="stat-card-value" style={{ fontSize: 13 }}>{teacher || '-'}</div>
          </div>
        </div>
      )}

      {/* ── 출석 체크 뷰 ── */}
      {attSubView === 'check' && (
        <section
          id="attendance-panel-check"
          role="tabpanel"
          aria-labelledby="attendance-tab-check"
          className="attendance-tab-panel attendance-check-panel"
        >
          <div className="attendance-week-picker">
            {isTeacher && (
              <span className="attendance-week-icon" aria-hidden="true">
                <AdminIcon name="calendar" size={17} />
              </span>
            )}
            {isTeacher ? (
              <span className="attendance-week-field">
                <label htmlFor="attendance-week">출석 날짜</label>
                <select
                  id="attendance-week"
                  value={selectedWeekKey ?? ''}
                  onChange={event => setPickedWeek({ year: curYear, requestKey: requestedWeekKey, key: event.target.value })}
                  disabled={editableWeeks.length === 0}
                >
                  {editableWeeks.length === 0 ? (
                    <option value="">입력 가능한 주일이 없습니다</option>
                  ) : editableWeeks.map(week => (
                    <option key={week.key} value={week.key}>{week.label}</option>
                  ))}
                </select>
              </span>
            ) : (
              <>
                <label htmlFor="attendance-week">출석 날짜</label>
                <select
                  id="attendance-week"
                  value={selectedWeekKey ?? ''}
                  onChange={event => setPickedWeek({ year: curYear, requestKey: requestedWeekKey, key: event.target.value })}
                  disabled={editableWeeks.length === 0}
                >
                  {editableWeeks.length === 0 ? (
                    <option value="">입력 가능한 주일이 없습니다</option>
                  ) : editableWeeks.map(week => (
                    <option key={week.key} value={week.key}>{week.label}</option>
                  ))}
                </select>
              </>
            )}
            <span className={isTeacher ? 'attendance-week-hint' : undefined}>{isTeacher
              ? '최근 4회 출석을 수정할 수 있습니다.'
              : '선택한 연도의 모든 정상 주일을 수정할 수 있습니다.'}</span>
          </div>

          {/* 이번 주 입력 요약 */}
          {selectedWeekKey && activeStudents.length > 0 && (
            <dl className="week-summary-row" aria-label={`${selectedWeek?.label ?? ''} 출석 입력 현황`}>
              <div className="week-summary-card green">
                <dt className="week-summary-label">출석</dt>
                <dd className="week-summary-count">{selectedWeekStats.O}<span>명</span></dd>
              </div>
              <div className="week-summary-card red">
                <dt className="week-summary-label">결석</dt>
                <dd className="week-summary-count">{selectedWeekStats.X}<span>명</span></dd>
              </div>
              <div className="week-summary-card gray">
                <dt className="week-summary-label">미입력</dt>
                <dd className="week-summary-count">{selectedWeekStats.empty}<span>명</span></dd>
              </div>
            </dl>
          )}

          {/* 출석 체크 리스트 */}
          <div className="check-list-wrap">
            <div className="check-list-header">
              {selectedWeekKey ? (
                <>
                  <span className="check-week-label">학생 명단</span>
                  <span className="check-progress"><strong>{checkedCount}</strong> / {displayStudents.length}명 입력</span>
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
                  const rowCls = val === 'O' ? ' row-o' : val === 'X' ? ' row-x' : '';
                  return (
                    <div key={student.id} className={`check-row${rowCls}`}>
                      <button
                        type="button"
                        className="check-student-info"
                        aria-label={`${student.name} 출석 이력 보기`}
                        onClick={() => dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: student.id, ck } })}
                      >
                        {student.photo ? (
                          <img src={student.photo} alt="" className="check-avatar-img" />
                        ) : (
                          <span className="check-avatar" aria-hidden="true">{student.name.charAt(0)}</span>
                        )}
                        <span className="check-name">{student.name}</span>
                        {saveFeedback?.sid === student.id && (
                          <span className={`attendance-row-save ${saveFeedback.status}`}>
                            {saveFeedback.status === 'saving' ? '저장 중' : saveFeedback.status === 'saved' ? '저장됨' : '저장 실패'}
                          </span>
                        )}
                      </button>
                      <div className="check-btns">
                        {ATTENDANCE_OPTIONS.map(v => (
                          <button
                            type="button"
                            key={v}
                            className={`check-btn ${v}${val === v ? ' active' : ''}`}
                            aria-label={`${student.name} ${v === 'O' ? '출석' : '결석'}${val === v ? ' 현재 선택됨, 다시 누르면 미입력으로 변경' : '으로 기록'}`}
                            aria-pressed={val === v}
                            onClick={() => selectedWeekKey && handleQuickCheck(student.id, v)}
                            disabled={!selectedWeekKey || attendanceSaving}
                          >
                            {val === v && <AdminIcon name="check" size={12} className="check-btn-selected-icon" />}
                            {v === 'O' ? '출석' : '결석'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </section>
      )}

      {/* ── 특이사항 뷰 ── */}
      {attSubView === 'suggest' && (
        <section
          id="attendance-panel-suggest"
          role="tabpanel"
          aria-labelledby="attendance-tab-suggest"
          className="attendance-tab-panel attendance-suggest-panel"
        >
          {suggestLoadError && (
            <div className="suggest-load-error" role="alert">
              특이사항을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.
            </div>
          )}
          {isTeacher && (
            <div className="suggest-form-card">
              <h2 className="suggest-form-title">특이사항 작성</h2>
              <p id="suggest-help" className="suggest-form-help">학생 돌봄이나 반 운영에 참고할 내용을 남겨 주세요. 민감한 개인정보는 필요한 만큼만 적어 주세요.</p>
              <label className="suggest-label" htmlFor="note-student">학생 <span className="suggest-optional">선택</span></label>
              <select id="note-student" className="visit-student-select" value={suggestStudentId} onChange={event => setSuggestStudentId(event.target.value)}>
                <option value="">반 전체·운영 관련</option>
                {students.map(student => <option key={student.id} value={student.id}>{student.name}{student.jang ? ' · 장결' : ''}</option>)}
              </select>
              <label className="suggest-label" htmlFor="teacher-suggestion">특이사항</label>
              <textarea
                id="teacher-suggestion"
                className="suggest-textarea"
                value={suggestText}
                onChange={e => setSuggestText(e.target.value)}
                aria-describedby="suggest-help"
                placeholder="내용을 입력해 주세요"
                rows={4}
              />
              <button
                type="button"
                className="suggest-submit-btn"
                onClick={() => handleSuggestSubmit(suggestStudent?.name)}
                disabled={!suggestText.trim() || suggestSaving}
              >
                {suggestSaving ? '등록 중...' : '등록하기'}
              </button>
            </div>
          )}
          {/* 관리자만 목록 표시 */}
          {!isTeacher && !suggestLoadError && (
            <>
              <div className="suggest-list-header">
                {classData[ck]?.teacher || ''} 교사 특이사항
                <span className="suggest-count">{suggestions.length}건</span>
              </div>
              {suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px', fontSize: 14 }}>
                  등록된 특이사항이 없습니다.
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
                      {s.studentName && <div className="suggest-item-student">{s.studentName}</div>}
                      <div className="suggest-item-text">{s.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ── 심방 요청 뷰 ── */}
      {attSubView === 'visit' && (
        <section
          id="attendance-panel-visit"
          role="tabpanel"
          aria-labelledby="attendance-tab-visit"
          className="attendance-tab-panel attendance-suggest-panel"
        >
          {visitLoadError && <div className="suggest-load-error" role="alert">심방 요청을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</div>}
          {isTeacher && (
            <div className="suggest-form-card visit-form-card">
              <h2 className="suggest-form-title">학생 심방 요청</h2>
              <p id="visit-help" className="suggest-form-help">교역자와 관리자에게 확인이 필요한 학생과 이유를 전달합니다.</p>
              <label className="suggest-label" htmlFor="visit-student">학생</label>
              <select id="visit-student" className="visit-student-select" value={visitStudentId} onChange={event => setVisitStudentId(event.target.value)}>
                <option value="">학생을 선택해 주세요</option>
                {students.map(student => <option key={student.id} value={student.id}>{student.name}{student.jang ? ' · 장결' : ''}</option>)}
              </select>
              <label className="suggest-label" htmlFor="visit-reason">요청 이유</label>
              <textarea id="visit-reason" className="suggest-textarea" value={visitText} onChange={event => setVisitText(event.target.value)}
                aria-describedby="visit-help" placeholder="최근 상황과 확인이 필요한 내용을 간단히 적어 주세요" rows={4} />
              <button type="button" className="suggest-submit-btn" onClick={() => visitStudent && handleVisitSubmit(visitStudent.name)}
                disabled={!visitStudent || !visitText.trim() || visitSaving}>
                {visitSaving ? '요청 중...' : '심방 요청하기'}
              </button>
            </div>
          )}
          {!visitLoadError && (
            <>
              <div className="suggest-list-header">이 반의 심방 요청 <span className="suggest-count">{visitRequests.length}건</span></div>
              {visitRequests.length === 0 ? <div className="visit-empty">등록된 심방 요청이 없습니다.</div>
                : <div className="visit-request-list">{visitRequests.map(request => <article key={request.id} className="suggest-item visit-request-item">
                  <div className="visit-request-heading"><strong>{request.studentName}</strong><span className={`visit-status ${request.status === 'done' ? 'done' : ''}`}>{request.status === 'done' ? '처리 완료' : '확인 필요'}</span></div>
                  <div className="suggest-item-meta">{new Date(request.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}{request.author && ` · ${request.author}`}</div>
                  <p className="suggest-item-text">{request.text}</p>
                </article>)}</div>}
            </>
          )}
        </section>
      )}

      {/* ── 출석부 테이블 뷰 ── */}
      {attSubView === 'table' && (
      <section
        id="attendance-panel-table"
        role="tabpanel"
        aria-labelledby="attendance-tab-table"
        className="attendance-tab-panel attendance-table-panel"
      >
      {/* 뷰 + 정렬 + 내보내기 */}
      <div className="view-btn-row attendance-table-toolbar" aria-label="출석부 보기 설정">
        {(['first', 'second', 'all'] as ViewKey[]).map(v => (
          <button
            type="button"
            key={v}
            className={`view-btn${curView === v ? ' active' : ''}`}
            aria-pressed={curView === v}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: v })}
          >
            {v === 'first' ? '1학기' : v === 'second' ? '2학기' : '전체'}
          </button>
        ))}
        <button
          type="button"
          className={`view-btn${sortByName ? ' active' : ''}`}
          aria-pressed={sortByName}
          onClick={() => setSortByName(s => !s)}
          title="이름 가나다 순으로 정렬"
        >
          가나다순
        </button>
        <div className="export-wrap" ref={exportRef}>
          <button
            ref={exportButtonRef}
            type="button"
            className="export-btn"
            onClick={() => setExportOpen(o => !o)}
            aria-label="출석부 내보내기 메뉴 열기"
            aria-expanded={exportOpen}
            aria-controls="attendance-export-menu"
          >
            내보내기 &#9662;
          </button>
          {exportOpen && (
            <div id="attendance-export-menu" className="export-menu">
              <button type="button" onClick={exportCSV}>CSV 다운로드</button>
              <button type="button" onClick={exportXLSX}>Excel 다운로드</button>
              <button type="button" onClick={exportPDF}>PDF 인쇄</button>
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
                <th scope="col" rowSpan={2} className="att-header-cell att-sticky-number" style={{ minWidth: 36 }}>순</th>
                <th scope="col" rowSpan={2} className="att-header-name" style={{ textAlign: 'center', minWidth: 72 }}>사진/이름</th>
                {headerCols}
                <th scope="col" rowSpan={2} className="att-header-cell" style={{ background: 'var(--surface2)' }}>출석/주차</th>
                <th scope="col" rowSpan={2} className="att-header-cell" style={{ background: 'var(--surface2)' }}>출석률</th>
                <th scope="col" rowSpan={2} className="att-header-cell" style={{ background: 'var(--surface2)' }}>등급</th>
              </tr>
              <tr>
                {headerDays}
              </tr>
            </thead>
            <tbody>
              {displayStudents.map(student => {
                const stats = calcStats(state, ck, student.id);
                const recorded = stats.present + stats.absent;
                const effectiveRate = recorded > 0 ? Math.round((stats.present / recorded) * 100) : 0;
                const grade = effectiveRate >= 90 ? 'A' : effectiveRate >= 80 ? 'B' : effectiveRate >= 70 ? 'C' : 'D';
                const gradeColor = grade === 'A' ? '#397052' : grade === 'B' ? '#6355a7' : grade === 'C' ? '#795a1c' : '#a53f3f';
                const rateClass = effectiveRate >= 90 ? 'att-rate-good' : effectiveRate >= 80 ? '' : effectiveRate >= 60 ? 'att-rate-warn' : recorded > 0 ? 'att-rate-bad' : '';
                return (
                  <tr key={student.id}>
                    <td className="att-stat-cell att-sticky-number" style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                      {student.num}
                    </td>
                    <th scope="row" className="att-cell-name">
                      <button
                        type="button"
                        className="att-student-history-button"
                        aria-label={`${student.name} 출석 이력 보기`}
                        onClick={() => dispatch({ type: 'OPEN_HISTORY_MODAL', payload: { sid: student.id, ck } })}
                      >
                        {student.photo ? (
                          <img src={student.photo} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 3px' }} />
                        ) : (
                          <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'var(--primary-text)', margin: '0 auto 3px' }}>
                            {student.name.charAt(0)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{student.name}</span>
                      </button>
                    </th>
                    {months.map(({ month, sundays }, mi) =>
                      sundays.map((day, di) => {
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
                        const statusLabel = val === 'O' ? '출석' : val === 'X' ? '결석' : '미입력';
                        return (
                          <td
                            key={k}
                            className={`att-cell${val ? ' ' + val : ''}${canEdit ? ' editable' : ' readonly'}`}
                            title={isTeacher && !teacherCanEdit ? '최근 4회 출석만 수정할 수 있습니다' : undefined}
                          >
                            {canEdit ? (
                              <button
                                type="button"
                                className="att-cell-edit-button"
                                disabled={attendanceSaving}
                                aria-label={`${student.name} ${month}월 ${day}일 출석 수정, 현재 ${statusLabel}`}
                                onClick={() => onCellClick(student.id, k)}
                              >
                                <span aria-hidden="true">{val}</span>
                              </button>
                            ) : val}
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
      </section>
      )}

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

      <AttendanceSaveBanner
        feedback={saveFeedback}
        visible={attSubView !== 'suggest'}
        onDismissSaved={dismissSavedFeedback}
        onRetry={feedback => saveAttendance(feedback.target, feedback.value, feedback)}
      />

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
