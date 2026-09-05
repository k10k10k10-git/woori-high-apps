'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, calcStats } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { useChartJs } from '@/hooks/useChartJs';
import ChartLoadState from '@/components/ChartLoadState';

function sortClassKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const [pa, ga, ca] = a.split('-').map(Number);
    const [pb, gb, cb] = b.split('-').map(Number);
    if (pa !== pb) return pa - pb;
    if (ga !== gb) return ga - gb;
    return ca - cb;
  });
}

function toPoints(rates: (number | null)[]) {
  return rates.map(r => r === null ? NaN : r);
}

export default function OverallDashboard() {
  const { state } = useApp();
  const { classData, attData, months, events } = state;

  const [rateTablePart, setRateTablePart] = useState<'1' | '2'>('1');
  const [weeklyGradePart, setWeeklyGradePart] = useState<'1' | '2'>('1');
  const [gradeRatePart, setGradeRatePart] = useState<'1' | '2'>('1');

  const chartWeeklyRef = useRef<HTMLCanvasElement>(null);
  const chartWeeklyGradeRef = useRef<HTMLCanvasElement>(null);
  const chartPartRef = useRef<HTMLCanvasElement>(null);
  const chartGradeRef = useRef<HTMLCanvasElement>(null);
  const { chartJsRef, chartJsReady, chartLoadError, retryChart } = useChartJs();

  const monthlyRates = useCallback((classKeys: string[]): (number | null)[] => {
    return months.map(({ sundays }, mi) => {
      const weekKeys = sundays.map((_, di) => evKey(mi, di)).filter(k => !events[k]);
      if (weekKeys.length === 0) return null;
      let total = 0, present = 0;
      classKeys.forEach(ck => {
        (classData[ck]?.students ?? []).forEach(s => {
          weekKeys.forEach(k => {
            const v = attData[ck]?.[s.id]?.[k];
            if (v === 'O' || v === 'X' || v === 'T') { total++; if (v === 'O') present++; }
          });
        });
      });
      return total === 0 ? null : Math.round((present / total) * 100);
    });
  }, [months, events, classData, attData]);

  const allCks = useMemo(() => Object.keys(classData), [classData]);
  const part1Cks = useMemo(() => allCks.filter(k => k.startsWith('1-')), [allCks]);
  const part2Cks = useMemo(() => allCks.filter(k => k.startsWith('2-')), [allCks]);
  const labels = useMemo(() => months.map(m => `${m.month}월`), [months]);
  const { weekLabels, weekKeys } = useMemo(() => {
    const weekLabels: string[] = [];
    const weekKeys: string[] = [];
    months.forEach(({ month, sundays }, mi) => {
      sundays.forEach((day, di) => {
        const k = evKey(mi, di);
        if (!events[k]) { weekKeys.push(k); weekLabels.push(`${month}/${day}`); }
      });
    });
    return { weekLabels, weekKeys };
  }, [months, events]);

  const weeklyCount = useCallback((cks: string[]): number[] => {
    return weekKeys.map(k =>
      cks.reduce((sum, ck) =>
        sum + (classData[ck]?.students ?? []).filter(s => attData[ck]?.[s.id]?.[k] === 'O').length
      , 0)
    );
  }, [weekKeys, classData, attData]);

  useEffect(() => {
    if (!chartJsReady || !chartJsRef.current) return;
    const Chart = chartJsRef.current;
    if (chartWeeklyRef.current) {
      const existing = Chart.getChart(chartWeeklyRef.current);
      if (existing) existing.destroy();
      const c = new Chart(chartWeeklyRef.current, {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [
            { label: '1부', data: weeklyCount(part1Cks), backgroundColor: 'rgba(155,141,212,.8)', borderColor: '#9B8DD4', borderWidth: 1 },
            { label: '2부', data: weeklyCount(part2Cks), backgroundColor: 'rgba(16,185,129,.8)', borderColor: '#10b981', borderWidth: 1 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0 } },
        },
      });
      return () => { try { c.destroy(); } catch { /* 이미 해제된 차트 */ } };
    }
  }, [chartJsReady, chartJsRef, weekLabels, part1Cks, part2Cks, weeklyCount]);

  useEffect(() => {
    if (!chartJsReady || !chartJsRef.current) return;
    const Chart = chartJsRef.current;
    if (chartWeeklyGradeRef.current) {
      const existing = Chart.getChart(chartWeeklyGradeRef.current);
      if (existing) existing.destroy();
      const gCks = allCks.filter(k => k.startsWith(`${weeklyGradePart}-`));
      const g1 = gCks.filter(k => k.split('-')[1] === '1');
      const g2 = gCks.filter(k => k.split('-')[1] === '2');
      const g3 = gCks.filter(k => k.split('-')[1] === '3');
      const c = new Chart(chartWeeklyGradeRef.current, {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [
            { label: '1학년', data: weeklyCount(g1), backgroundColor: 'rgba(245,158,11,.8)', borderColor: '#f59e0b', borderWidth: 1 },
            { label: '2학년', data: weeklyCount(g2), backgroundColor: 'rgba(59,130,246,.8)', borderColor: '#3b82f6', borderWidth: 1 },
            { label: '3학년', data: weeklyCount(g3), backgroundColor: 'rgba(239,68,68,.8)', borderColor: '#ef4444', borderWidth: 1 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0 } },
        },
      });
      return () => { try { c.destroy(); } catch { /* 이미 해제된 차트 */ } };
    }
  }, [chartJsReady, chartJsRef, weekLabels, allCks, weeklyGradePart, weeklyCount]);

  useEffect(() => {
    if (!chartJsReady || !chartJsRef.current) return;
    const Chart = chartJsRef.current;
    if (chartPartRef.current) {
      const existing = Chart.getChart(chartPartRef.current);
      if (existing) existing.destroy();
      const c = new Chart(chartPartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: '1부', data: toPoints(monthlyRates(part1Cks)), borderColor: '#9B8DD4', backgroundColor: 'rgba(155,141,212,.12)', tension: 0.3, fill: true, spanGaps: true },
            { label: '2부', data: toPoints(monthlyRates(part2Cks)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.10)', tension: 0.3, fill: true, spanGaps: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0, max: 100 } },
        },
      });
      return () => { try { c.destroy(); } catch { /* 이미 해제된 차트 */ } };
    }
  }, [chartJsReady, chartJsRef, labels, part1Cks, part2Cks, monthlyRates]);

  useEffect(() => {
    if (!chartJsReady || !chartJsRef.current) return;
    const Chart = chartJsRef.current;
    if (chartGradeRef.current) {
      const existing = Chart.getChart(chartGradeRef.current);
      if (existing) existing.destroy();
      const grCks = allCks.filter(k => k.startsWith(`${gradeRatePart}-`));
      const gr1 = grCks.filter(k => k.split('-')[1] === '1');
      const gr2 = grCks.filter(k => k.split('-')[1] === '2');
      const gr3 = grCks.filter(k => k.split('-')[1] === '3');
      const c = new Chart(chartGradeRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: '1학년', data: toPoints(monthlyRates(gr1)), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.10)', tension: 0.3, fill: true, spanGaps: true },
            { label: '2학년', data: toPoints(monthlyRates(gr2)), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.10)', tension: 0.3, fill: true, spanGaps: true },
            { label: '3학년', data: toPoints(monthlyRates(gr3)), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.10)', tension: 0.3, fill: true, spanGaps: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0, max: 100 } },
        },
      });
      return () => { try { c.destroy(); } catch { /* 이미 해제된 차트 */ } };
    }
  }, [chartJsReady, chartJsRef, labels, allCks, gradeRatePart, monthlyRates]);

  const allClassKeys = sortClassKeys(Object.keys(classData));
  const part1Keys = allClassKeys.filter(k => k.startsWith('1-'));
  const part2Keys = allClassKeys.filter(k => k.startsWith('2-'));
  const totalAll = allClassKeys.reduce((s, k) => s + (classData[k]?.students.length ?? 0), 0);

  const thisWeekKey = (() => {
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const kstMonth = kstNow.getUTCMonth() + 1;
    const kstDay = kstNow.getUTCDate();
    for (let mi = months.length - 1; mi >= 0; mi--) {
      const { month, sundays } = months[mi];
      if (month > kstMonth) continue;
      for (let di = sundays.length - 1; di >= 0; di--) {
        const day = sundays[di];
        if (month < kstMonth || day <= kstDay) {
          const k = evKey(mi, di);
          if (!events[k]) return k;
        }
      }
    }
    return null;
  })();

  const thisWeekLabel = (() => {
    if (!thisWeekKey) return null;
    const [mi, di] = thisWeekKey.split('-').map(Number);
    return `${months[mi]?.month}/${months[mi]?.sundays[di]}`;
  })();

  const thisWeekRate = (() => {
    if (!thisWeekKey) return null;
    let total = 0, present = 0;
    allClassKeys.forEach(ck => {
      (classData[ck]?.students ?? []).forEach(s => {
        const v = attData[ck]?.[s.id]?.[thisWeekKey];
        if (v === 'O' || v === 'X' || v === 'T') {
          total++;
          if (v === 'O') present++;
        }
      });
    });
    return total === 0 ? null : Math.round((present / total) * 100);
  })();

  const notInputtedClasses = thisWeekKey
    ? allClassKeys.filter(ck => {
        const students = classData[ck]?.students ?? [];
        if (students.length === 0) return false;
        return !students.some(s => attData[ck]?.[s.id]?.[thisWeekKey] !== undefined);
      })
    : [];

  function classAvgRate(ck: string): number | null {
    const students = classData[ck]?.students ?? [];
    if (students.length === 0) return null;
    const rates = students.map(s => {
      const { present, absent, tardy } = calcStats(state, ck, s.id);
      const rec = present + absent + tardy;
      return rec === 0 ? null : Math.round((present / rec) * 100);
    }).filter((r): r is number => r !== null);
    if (rates.length === 0) return null;
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  }

  return (
    <>
      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">현황 대시보드</span>
        </div>
        <div style={{ padding: '0 12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="dash-stat-card">
            <div className="dash-stat-label">전체 학생</div>
            <div className="dash-stat-value">{totalAll}<span className="dash-stat-unit">명</span></div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">전체 반</div>
            <div className="dash-stat-value">{allClassKeys.length}<span className="dash-stat-unit">반</span></div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">1부 학생</div>
            <div className="dash-stat-value">{part1Keys.reduce((s,k)=>s+(classData[k]?.students.length??0),0)}<span className="dash-stat-unit">명</span></div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-label">2부 학생</div>
            <div className="dash-stat-value">{part2Keys.reduce((s,k)=>s+(classData[k]?.students.length??0),0)}<span className="dash-stat-unit">명</span></div>
          </div>
          <div className="dash-stat-card" style={{ borderColor: thisWeekRate !== null && thisWeekRate < 70 ? '#fca5a5' : thisWeekRate !== null && thisWeekRate >= 80 ? '#6ee7b7' : undefined }}>
            <div className="dash-stat-label">이번 주 출석률{thisWeekLabel ? ` (${thisWeekLabel})` : ''}</div>
            <div className="dash-stat-value" style={{ color: thisWeekRate === null ? 'var(--text3)' : thisWeekRate >= 80 ? 'var(--green-text)' : thisWeekRate >= 70 ? 'var(--amber-text)' : 'var(--red-text)' }}>
              {thisWeekRate === null ? '-' : `${thisWeekRate}`}<span className="dash-stat-unit">{thisWeekRate === null ? '' : '%'}</span>
            </div>
            {thisWeekRate !== null && notInputtedClasses.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>입력된 반 기준</div>
            )}
          </div>
        </div>

        {notInputtedClasses.length > 0 && (
          <div style={{ margin: '0 12px 16px', padding: '12px 14px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 8 }}>
              미입력 반 ({notInputtedClasses.length}개)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {notInputtedClasses.map(ck => {
                const [p, g, c] = ck.split('-');
                const teacher = classData[ck]?.teacher;
                return (
                  <span key={ck} style={{ padding: '3px 10px', background: '#fef3c7', borderRadius: 999, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                    {p}부 {g}학년 {c}반{teacher ? ` · ${teacher}` : ''}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {thisWeekKey && notInputtedClasses.length === 0 && (
          <div style={{ margin: '0 12px 16px', padding: '10px 14px', background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 10, fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>
            모든 반이 이번 주 출석을 입력했습니다.
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 4, padding: '10px 12px 4px' }} role="tablist" aria-label="부서 선택">
            {(['1', '2'] as const).map(p => (
              <button key={p} role="tab" aria-selected={rateTablePart === p} className={`view-btn${rateTablePart === p ? ' active' : ''}`}
                onClick={() => setRateTablePart(p)}>{p}부</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['반', '교사', '학생수', '누적 출석률'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text2)', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allClassKeys.filter(k => k.startsWith(`${rateTablePart}-`)).map((ck, i) => {
                  const [, g, c] = ck.split('-');
                  const rate = classAvgRate(ck);
                  const cnt = classData[ck]?.students.length ?? 0;
                  const teacher = classData[ck]?.teacher ?? '-';
                  return (
                    <tr key={ck} style={{ background: i % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600 }}>{g}학년 {c}반</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text2)' }}>{teacher}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>{cnt}명</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700,
                        color: rate === null ? 'var(--text3)' : rate >= 80 ? 'var(--green-text)' : rate >= 70 ? 'var(--amber-text)' : 'var(--red-text)' }}>
                        {rate === null ? '-' : `${rate}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ChartLoadState ready={chartJsReady} error={chartLoadError} onRetry={retryChart} />

      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">주차별 전체 출석인원</span>
        </div>
        <div style={{ padding: '0 16px 16px', height: 240 }}>
          <canvas ref={chartWeeklyRef} />
        </div>
      </div>

      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">주차별 학년별 출석인원</span>
          <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="주차별 학년 출석인원 부서 선택">
            {(['1', '2'] as const).map(p => (
              <button key={p} role="tab" aria-selected={weeklyGradePart === p} className={`view-btn${weeklyGradePart === p ? ' active' : ''}`}
                style={{ padding: '3px 12px', fontSize: 12 }}
                onClick={() => setWeeklyGradePart(p)}>{p}부</button>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 16px 16px', height: 240 }}>
          <canvas ref={chartWeeklyGradeRef} />
        </div>
      </div>

      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">1부 vs 2부 월별 출석률</span>
        </div>
        <div style={{ padding: '0 16px 16px', height: 220 }}>
          <canvas ref={chartPartRef} />
        </div>
      </div>

      <div className="overall-card">
        <div className="overall-card-header">
          <span className="overall-card-title">학년별 월별 출석률</span>
          <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="학년별 월별 출석률 부서 선택">
            {(['1', '2'] as const).map(p => (
              <button key={p} role="tab" aria-selected={gradeRatePart === p} className={`view-btn${gradeRatePart === p ? ' active' : ''}`}
                style={{ padding: '3px 12px', fontSize: 12 }}
                onClick={() => setGradeRatePart(p)}>{p}부</button>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 16px 16px', height: 220 }}>
          <canvas ref={chartGradeRef} />
        </div>
      </div>
    </>
  );
}
