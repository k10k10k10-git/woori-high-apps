'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db, ref, get } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { getSundaysForYear, buildHolidayRanges, buildEvents, evKey, getWindowYears } from '@/utils/dates';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';
import { useModalFocus } from '@/hooks/useModalFocus';
import type { Student } from '@/types';

interface MonthStat {
  month: number;
  p: number;
  a: number;
  sc: number; // non-holiday sundays count
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
}

function isSameStudent(ref_s: Student, candidate: Record<string, unknown>): boolean {
  if (ref_s.name !== candidate.name) return false;
  const fields: Array<keyof Student> = ['birth', 'phone', 'pphone', 'school'];
  const refHasInfo  = fields.some(f => ref_s[f]);
  const candHasInfo = fields.some(f => candidate[f]);
  if (!refHasInfo || !candHasInfo) return true;
  const matched = fields.filter(f => ref_s[f] && candidate[f] && ref_s[f] === candidate[f]);
  return matched.length >= 1;
}

function computeMonthlyStats(
  attRecord: Record<string, string>,
  months: { month: number; sundays: number[] }[],
  events: Record<string, string>
) {
  let present = 0, absent = 0;
  const monthly: MonthStat[] = months.map(({ month, sundays }, mi) => {
    let p = 0, a = 0, sc = 0;
    sundays.forEach((_, di) => {
      const k = evKey(mi, di);
      if (events[k]) return;
      sc++;
      const v = normalizeAttendanceValue(attRecord[k]);
      if (v === 'O') { p++; present++; }
      else if (v === 'X') { a++; absent++; }
    });
    return { month, p, a, sc };
  });
  const checked = present + absent;
  const rate = checked > 0 ? Math.round((present / checked) * 100) : 0;
  return { present, absent, total: checked, rate, monthly };
}

const EMPTY_STATS = {
  present: 0, absent: 0, total: 0, rate: 0,
  monthly: [] as MonthStat[],
};

export default function HistoryModal({ sid, curCk: propCk, onClose }: { sid: string; curCk?: string; onClose: () => void }) {
  const { state } = useApp();
  const { curYear, classData, attData } = state;
  const isTeacher = state.userRole?.role === 'teacher';

  const student =
    (propCk ? classData[propCk]?.students.find(s => s.id === sid) : null)
    ?? Object.values(classData).flatMap(c => c.students).find(s => s.id === sid);

  const mountedYearRef    = useRef(curYear);
  const mountedCkRef      = useRef(propCk);
  const mountedAttDataRef = useRef(attData);

  const [results, setResults] = useState<YearStat[]>([]);
  const [loading, setLoading] = useState(true);
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
    loadAllYears();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAllYears() {
    setLoading(true);

    let curCk: string | null = propCk ?? null;
    if (!curCk) {
      for (const [ck, cls] of Object.entries(classData)) {
        if (cls.students.find(s => s.id === sid)) { curCk = ck; break; }
      }
    }

    const curGradeNum = curCk ? parseInt(curCk.split('-')[1]) : 1;
    const curPartNum  = curCk ? curCk.split('-')[0] : null;
    const gradeOneYear = mountedYearRef.current - (curGradeNum - 1);
    const allYears = [gradeOneYear, gradeOneYear + 1, gradeOneYear + 2].filter(y => y > 2020);

    const found: YearStat[] = await Promise.all(allYears.map(async year => {
      const grade = 1 + (year - gradeOneYear);
      const isCurYear = year === mountedYearRef.current;

      if (isCurYear && curCk) {
        const yearMonths = getSundaysForYear(year);
        const yearRanges = buildHolidayRanges(getWindowYears(year));
        const yearEvents = buildEvents(year, yearMonths, yearRanges, {});
        const attRecord = (mountedAttDataRef.current[curCk]?.[sid] ?? {}) as Record<string, string>;
        const stats = computeMonthlyStats(attRecord, yearMonths, yearEvents);
        return { year, grade, ck: curCk, ...stats };
      }

      try {
        const [classSnap, attSnap] = await Promise.all([
          get(ref(db, `classes/${year}`)),
          get(ref(db, `attendance/${year}`)),
        ]);

        if (!classSnap.exists()) return { year, grade, ck: null, ...EMPTY_STATS };

        const fbClasses = classSnap.val() as Record<string, {
          students?: Record<string, Record<string, unknown>>;
        }>;
        const fbAtt = attSnap.exists()
          ? attSnap.val() as Record<string, Record<string, Record<string, string>>>
          : {};

        let foundCk: string | null = null;
        let foundSid: string | null = null;
        let attSid:   string | null = null;

        const samePart = Object.keys(fbClasses).filter(
          ck => ck.split('-')[1] === String(grade) && ck.split('-')[0] === curPartNum
        );
        const anyPart = Object.keys(fbClasses).filter(
          ck => ck.split('-')[1] === String(grade) && ck.split('-')[0] !== curPartNum
        );
        const candidateCks = [...samePart, ...anyPart];

        const storedIdOf = (s: Record<string, unknown>) => (s['id'] as string | undefined) ?? null;

        // 1순위: Firebase key = 현재 sid
        for (const ck of candidateCks) {
          if (fbClasses[ck].students?.[sid]) {
            foundCk = ck; foundSid = sid; attSid = sid; break;
          }
        }

        // 2순위: 학생 객체 내부 id 필드 = 현재 sid
        if (!foundCk) {
          outer2: for (const ck of candidateCks) {
            for (const [fkey, s] of Object.entries(fbClasses[ck].students ?? {})) {
              if (storedIdOf(s) === sid) {
                foundCk = ck; foundSid = fkey; attSid = sid; break outer2;
              }
            }
          }
        }

        // 3순위: 이름 + 신상정보 매핑
        if (!foundCk && student) {
          outer3: for (const ck of candidateCks) {
            for (const [id2, s] of Object.entries(fbClasses[ck].students ?? {})) {
              if (isSameStudent(student, s)) {
                foundCk = ck; foundSid = id2;
                attSid = storedIdOf(s) ?? id2;
                break outer3;
              }
            }
          }
        }

        if (!foundCk || !foundSid || !attSid) return { year, grade, ck: null, ...EMPTY_STATS };

        const yearMonths = getSundaysForYear(year);
        const yearRanges = buildHolidayRanges(getWindowYears(year));
        const yearEvents = buildEvents(year, yearMonths, yearRanges, {});

        const attRecord = fbAtt[foundCk]?.[attSid] ?? {};
        const stats = computeMonthlyStats(attRecord, yearMonths, yearEvents);
        return { year, grade, ck: foundCk, ...stats };
      } catch {
        return { year, grade, ck: null, ...EMPTY_STATS };
      }
    }));

    found.sort((a, b) => a.year - b.year);
    setResults(found);
    setLoading(false);
  }

  const gradeColor = (rate: number) =>
    rate >= 90 ? '#397052' : rate >= 80 ? '#6355a7' : rate >= 70 ? '#795a1c' : '#a53f3f';

  void mountedCkRef;

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
            <div className="history-modal-subtitle">출석 이력 (3년)</div>
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
          <div className="history-modal-loading">불러오는 중...</div>
        ) : (
          <div className="history-year-list">
            {results.map(r => {
              const isCur = r.year === mountedYearRef.current;
              const ckParts = r.ck ? r.ck.split('-') : null;
              const classLabel = ckParts ? `${ckParts[0]}부 ${ckParts[1]}학년 ${ckParts[2]}반` : `${r.grade}학년`;
              const gc = gradeColor(r.rate);
              const gradeLabel = r.rate >= 90 ? 'A' : r.rate >= 80 ? 'B' : r.rate >= 70 ? 'C' : 'D';
              return (
                <article key={r.year} className={`history-year-card${isCur ? ' is-current' : ''}`}>
                  <header className="history-year-heading">
                    {r.year}년{isCur && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, opacity: .85 }}>(현재)</span>}
                  </header>

                  <div className="history-year-summary">
                    <div className="history-year-class">{classLabel}</div>
                    {r.ck === null ? (
                      <div className="history-year-empty">데이터 없음</div>
                    ) : (
                      <>
                        <div className="history-year-grade">
                          <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: gc + '22', color: gc }}>
                            {gradeLabel}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: gc }}>{r.rate}%</span>
                        </div>
                        <div className="history-year-totals">
                          출석 {r.present} · 결석 {r.absent} / {r.total}주
                        </div>
                      </>
                    )}
                  </div>

                  <div className="history-month-list">
                    {r.monthly.filter(m => m.sc > 0).map(m => {
                      const color = r.ck === null || m.sc === 0
                        ? 'var(--text3)'
                        : m.p >= m.sc / 2 ? 'var(--green-text)' : 'var(--red-text)';
                      return (
                        <div key={m.month} style={{ textAlign: 'center', minWidth: 28 }}>
                          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{m.month}월</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color }}>{m.p}/{m.sc}</div>
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
