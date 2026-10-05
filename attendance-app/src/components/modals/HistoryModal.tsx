'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db, ref, get } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { getSundaysForYear, buildHolidayRanges, buildEvents, getWindowYears } from '@/utils/dates';
import { attendanceHistoryStats, attendanceGrade } from '@/utils/attendanceHistory';
import { resolveStudentConnection, type StudentCandidate } from '@/utils/studentConnection';
import { useModalFocus } from '@/hooks/useModalFocus';
import type { Student, AttData, CustomEventData } from '@/types';

interface MonthStat {
  month: number;
  p: number;
  a: number;
  recorded: number;
}

interface YearStat {
  year: number;
  grade: number;
  ck: string | null;
  present: number;
  absent: number;
  total: number;
  rate: number;
  monthly: MonthStat[];
  status: 'matched' | 'review' | 'missing' | 'error' | 'future';
}

const EMPTY_STATS = {
  present: 0, absent: 0, total: 0, rate: 0,
  monthly: [] as MonthStat[],
};

export default function HistoryModal({ sid, curCk: propCk, onClose }: { sid: string; curCk?: string; onClose: () => void }) {
  const { state } = useApp();
  const { curYear, classData, attData } = state;
  const isTeacher = state.userRole?.role === 'teacher';

  const currentMatches = Object.entries(classData).flatMap(([classKey, info]) =>
    info.students.filter(s => s.id === sid && (!propCk || classKey === propCk)).map(student => ({ classKey, student })));
  const currentStudent = currentMatches.length === 1 ? currentMatches[0] : null;
  const student = currentStudent?.student;
  const curCk = currentStudent?.classKey ?? propCk ?? null;
  const gradeOneYear = curYear - (Number(curCk?.split('-')[1] ?? 1) - 1);
  const name = student?.name, personId = student?.personId, birth = student?.birth, phone = student?.phone;
  const reference = useMemo(() => name ? { id: sid, name, personId, birth, phone } : null, [sid, name, personId, birth, phone]);
  const [retry, setRetry] = useState(0);
  const scope = JSON.stringify([curYear, curCk, state.dataRevision, retry, reference]);
  const [load, setLoad] = useState<{ scope: string; results: YearStat[] } | null>(null);
  const loading = load?.scope !== scope;
  const results = (load?.scope === scope ? load.results : []).map(result => {
    if (result.year !== curYear || !curCk || !student) return result;
    return { ...result, ck: curCk, status: 'matched' as const,
      ...attendanceHistoryStats(attData, curCk, sid, state.months, state.events) };
  });
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ─── 드래그 다운 닫기 ────────────────────────────────────────
  const sheetRef  = useRef<HTMLDivElement>(null);
  // onClose를 ref로 보관 → dismiss 의존성 제거 → useEffect 재실행 없음
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const dismiss = useCallback(() => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'transform .22s ease-in';
      el.style.transform  = 'translateY(110%)';
    }
    setTimeout(() => onCloseRef.current(), 210);
  }, []); // ← 의존성 없음: 한 번만 생성, 터치 중 리스너 교체 없음

  useModalFocus({ containerRef: sheetRef, initialFocusRef: closeButtonRef, onDismiss: dismiss });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let active = false;
    let startClientY = 0;
    let delta = 0;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const rect  = sheet.getBoundingClientRect();
      if (touch.clientY - rect.top > 70) return;
      active = true;
      startClientY = touch.clientY;
      delta = 0;
      // ★ iOS가 touchstart 시점에 스크롤을 선점하기 전에 overflow 차단
      sheet.style.overflowY = 'hidden';
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const d = Math.max(0, e.touches[0].clientY - startClientY);
      delta = d;
      e.preventDefault();
      sheet.style.transition = 'none';
      sheet.style.transform  = `translateY(${d}px)`;
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      sheet.style.overflowY = ''; // 스크롤 복원
      if (delta > 40) {
        dismiss();
      } else {
        sheet.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)';
        sheet.style.transform  = 'translateY(0)';
      }
      delta = 0;
    };

    sheet.addEventListener('touchstart',     onStart, { passive: true  });
    document.addEventListener('touchmove',   onMove,  { passive: false });
    document.addEventListener('touchend',    onEnd,   { passive: true  });
    document.addEventListener('touchcancel', onEnd,   { passive: true  });

    return () => {
      sheet.removeEventListener('touchstart',     onStart);
      document.removeEventListener('touchmove',   onMove);
      document.removeEventListener('touchend',    onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [dismiss]); // dismiss는 이제 절대 바뀌지 않음

  useEffect(() => {
    let active = true;
    const allYears = [gradeOneYear, gradeOneYear + 1, gradeOneYear + 2].filter(y => y > 2020);
    void Promise.all(allYears.map(async (year): Promise<YearStat> => {
      const grade = 1 + (year - gradeOneYear);
      const empty = { year, grade, ck: null, ...EMPTY_STATS };
      if (year > curYear) return { ...empty, status: 'future' };
      if (!reference) return { ...empty, status: 'review' };
      if (year === curYear) return { ...empty, status: 'matched' };
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const [classSnap, attSnap, eventSnap] = await Promise.race([
          Promise.all([get(ref(db, `classes/${year}`)), get(ref(db, `attendance/${year}`)), get(ref(db, `events/${year}`))]),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('이력 조회 시간 초과')), 15000); }),
        ]);
        const fbClasses = (classSnap.val() ?? {}) as Record<string, { students?: Record<string, Student> }>;
        const fbAtt = (attSnap.val() ?? {}) as AttData;
        const allCandidates: StudentCandidate[] = Object.entries(fbClasses)
          .flatMap(([classKey, info]) => Object.entries(info.students ?? {}).map(([key, value]) => ({
            classKey, storedId: value.id, student: { ...value, id: key },
          })));
        const candidates = reference.personId && allCandidates.some(({ student }) => student.personId === reference.personId)
          ? allCandidates : allCandidates.filter(({ classKey }) => classKey.split('-')[1] === String(grade));
        const connection = resolveStudentConnection(reference, candidates);
        if (connection.status !== 'matched') return { ...empty, status: connection.status };
        const { classKey, student: linked, storedId } = connection.candidate;
        let attSid = linked.id;
        // 오래된 내부 ID 출석도 다른 학생의 원장 키와 겹치지 않을 때만 읽는다.
        if (!fbAtt[classKey]?.[attSid] && storedId && storedId !== attSid && fbAtt[classKey]?.[storedId]) {
          if (allCandidates.some(candidate => candidate.classKey === classKey && candidate.student.id !== linked.id
            && (candidate.student.id === storedId || candidate.storedId === storedId))) return { ...empty, status: 'review' };
          attSid = storedId;
        }
        const yearMonths = getSundaysForYear(year);
        const yearRanges = buildHolidayRanges(getWindowYears(year));
        const yearEvents = buildEvents(year, yearMonths, yearRanges, (eventSnap.val() ?? {}) as CustomEventData);
        return { year, grade, ck: classKey, status: 'matched', ...attendanceHistoryStats(fbAtt, classKey, attSid, yearMonths, yearEvents) };
      } catch {
        return { ...empty, status: 'error' };
      } finally {
        clearTimeout(timeout);
      }
    })).then(results => { if (active) setLoad({ scope, results }); });
    return () => { active = false; };
  }, [curYear, gradeOneYear, reference, scope]);

  const gradeColor = (rate: number) =>
    rate >= 90 ? '#397052' : rate >= 80 ? '#6355a7' : rate >= 70 ? '#795a1c' : '#a53f3f';

  return createPortal(
    <div className={`modal-overlay${isTeacher ? ' teacher-attendance-modal' : ''}`} onClick={dismiss}
      role="dialog" aria-modal="true" aria-label={`${student?.name ?? ''} 출석 이력`}>
      <div
        ref={sheetRef}
        className="modal-sheet history-modal-sheet"
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
        style={{ maxWidth: 620 }}
      >
        {/* 드래그 핸들 — 모달 상단 70px 영역 전체가 드래그 감지 영역 */}
        <div className="modal-handle-area">
          <div className="modal-handle" />
        </div>

        <div className="history-modal-header">
          {student?.photo ? (
            <img src={student.photo} alt="" className="history-modal-avatar-img" />
          ) : (
            <div className="history-modal-avatar" aria-hidden="true">
              {student?.name?.charAt(0) ?? '?'}
            </div>
          )}
          <div className="history-modal-copy">
            <div className="history-modal-name">{student?.name ?? '알 수 없음'}</div>
            <div className="history-modal-subtitle">출석 이력 (3년) · 행사·미입력 제외</div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="history-modal-close"
            onClick={dismiss}
          >
            닫기
          </button>
        </div>

        {loading ? (
          <div className="history-modal-loading" role="status">출석 이력을 불러오는 중...</div>
        ) : (
          <div className="history-year-list">
            {results.map(r => {
              const isCur = r.year === curYear;
              const ckParts = r.ck ? r.ck.split('-') : null;
              const classLabel = ckParts ? `${ckParts[0]}부 ${ckParts[1]}학년 ${ckParts[2]}반` : `${r.grade}학년`;
              const gc = gradeColor(r.rate);
              const gradeLabel = attendanceGrade(r.rate);
              return (
                <article key={r.year} className={`history-year-card${isCur ? ' is-current' : ''}`}>
                  <header className="history-year-heading">
                    {r.year}년{isCur && <span className="history-current-label"> (현재)</span>}
                  </header>

                  <div className="history-year-summary">
                    <div className="history-year-class">{classLabel}</div>
                    {r.status !== 'matched' ? (
                      <div className="history-year-empty" role={r.status === 'error' ? 'alert' : undefined}>
                        {r.status === 'error' ? '이력을 불러오지 못했습니다. 기록이 없다는 뜻은 아닙니다.'
                          : r.status === 'review' ? '동일 학생 연결 확인 필요'
                            : r.status === 'future' ? '아직 해당 학년이 아닙니다.' : '연결된 학생 명단 없음'}
                        {r.status === 'error' && <button className="history-retry" type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button>}
                      </div>
                    ) : r.total === 0 ? (
                      <div className="history-year-empty">— · 입력된 출석 기록 없음</div>
                    ) : (
                      <>
                        <div className="history-year-grade">
                          <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: gc + '22', color: gc }}>
                            {gradeLabel}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: gc }}>{r.rate}%</span>
                        </div>
                        <div className="history-year-totals">
                          출석 {r.present} · 결석 {r.absent} / 입력 {r.total}회
                        </div>
                      </>
                    )}
                  </div>

                  <div className="history-month-list">
                    {r.monthly.map(m => {
                      return (
                        <div key={m.month} className="history-month" aria-label={`${m.month}월 ${m.recorded ? `출석 ${m.p}회, 입력 ${m.recorded}회` : '입력 기록 없음'}`}>
                          <div className="history-month-label">{m.month}월</div>
                          <div className="history-month-value">{m.recorded ? `${m.p}/${m.recorded}` : '—'}</div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
