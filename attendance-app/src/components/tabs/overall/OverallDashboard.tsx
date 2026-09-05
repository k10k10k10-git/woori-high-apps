'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { useChartJs } from '@/hooks/useChartJs';
import ChartLoadState from '@/components/ChartLoadState';
import { annualClassAverageRate } from '@/utils/annualAttendance';
import '@/components/admin/admin-trends.css';

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
  const totalAll = allClassKeys.reduce((sum, key) => sum + (classData[key]?.students.length ?? 0), 0);
  const classRows = useMemo(() => sortClassKeys(Object.keys(classData)).map(key => ({
    key, teacher: classData[key]?.teacher || '담임 교사 미등록',
    count: classData[key]?.students.length ?? 0,
    rate: annualClassAverageRate({ months, attData, events }, key, classData[key]?.students ?? []),
  })), [classData, months, attData, events]);

  return (
    <div className="admin-trends">
      <p className="at-context">{state.curYear}년 전체 기간 · {allClassKeys.length}개 반 · 학생 {totalAll.toLocaleString()}명 (장결 포함)</p>
      <section className="at-section" aria-labelledby="at-class-title">
        <header className="at-section-heading">
          <div><h3 id="at-class-title">반별 누적 출석률</h3><p>입력 기록이 있는 학생의 개인별 출석률 평균입니다.</p></div>
          <div className="at-parts" role="group" aria-label="누적 출석률 부서 선택">
            {(['1', '2'] as const).map(p => <button type="button" key={p} aria-pressed={rateTablePart === p} onClick={() => setRateTablePart(p)}>{p}부</button>)}
          </div>
        </header>
        <div className="at-table-wrap">
          <table className="at-table">
            <caption className="ad-sr-only">{state.curYear}년 {rateTablePart}부 반별 연간 출석률</caption>
            <thead><tr><th scope="col">반</th><th scope="col">담임 교사</th><th scope="col">학생 수</th><th scope="col">누적 출석률</th></tr></thead>
            <tbody>{classRows.filter(row => row.key.startsWith(`${rateTablePart}-`)).map(row => {
              const [, grade, number] = row.key.split('-');
              return <tr key={row.key}><th scope="row">{grade}학년 {number}반</th><td>{row.teacher}</td><td>{row.count}명</td><td>{row.rate === null ? '—' : `${row.rate}%`}</td></tr>;
            })}</tbody>
          </table>
        </div>
        {!classRows.some(row => row.key.startsWith(`${rateTablePart}-`)) && <p className="at-empty">{rateTablePart}부에 등록된 반이 없습니다.</p>}
      </section>
      <ChartLoadState ready={chartJsReady} error={chartLoadError} onRetry={retryChart} />
      {totalAll === 0 && <p className="at-empty">학생을 등록하고 출석을 입력하면 이곳에서 변화를 확인할 수 있습니다.</p>}
      <div className="at-chart-grid">
        <section className="at-section" aria-labelledby="at-weekly-title">
          <header className="at-section-heading"><div><h3 id="at-weekly-title">주차별 출석 인원</h3><p>1부와 2부의 주일 출석 흐름</p></div></header>
          <div className="at-canvas"><canvas ref={chartWeeklyRef} role="img" aria-label="주차별 1부와 2부 출석 인원 막대 그래프" /></div>
        </section>
        <section className="at-section" aria-labelledby="at-weekly-grade-title">
          <header className="at-section-heading"><div><h3 id="at-weekly-grade-title">학년별 출석 인원</h3><p>주차별 1·2·3학년 비교</p></div>
            <div className="at-parts" role="group" aria-label="주차별 학년 출석인원 부서 선택">
              {(['1', '2'] as const).map(p => <button type="button" key={p} aria-pressed={weeklyGradePart === p} onClick={() => setWeeklyGradePart(p)}>{p}부</button>)}
            </div>
          </header>
          <div className="at-canvas"><canvas ref={chartWeeklyGradeRef} role="img" aria-label={`${weeklyGradePart}부 주차별 학년 출석 인원 막대 그래프`} /></div>
        </section>
        <section className="at-section" aria-labelledby="at-monthly-title">
          <header className="at-section-heading"><div><h3 id="at-monthly-title">부서별 월별 출석률</h3><p>1부와 2부의 입력 기록 기준</p></div></header>
          <div className="at-canvas"><canvas ref={chartPartRef} role="img" aria-label="1부와 2부 월별 출석률 선 그래프" /></div>
        </section>
        <section className="at-section" aria-labelledby="at-monthly-grade-title">
          <header className="at-section-heading"><div><h3 id="at-monthly-grade-title">학년별 월별 출석률</h3><p>월별 1·2·3학년 비교</p></div>
            <div className="at-parts" role="group" aria-label="학년별 월별 출석률 부서 선택">
              {(['1', '2'] as const).map(p => <button type="button" key={p} aria-pressed={gradeRatePart === p} onClick={() => setGradeRatePart(p)}>{p}부</button>)}
            </div>
          </header>
          <div className="at-canvas"><canvas ref={chartGradeRef} role="img" aria-label={`${gradeRatePart}부 학년별 월별 출석률 선 그래프`} /></div>
        </section>
      </div>
      <p className="at-note">행사 주일은 집계에서 제외합니다. 출석률은 입력된 O·X·T 중 O의 비율이며, 기록이 없는 월은 빈 구간으로 표시합니다. 주차별 인원은 현재 입력된 O의 수입니다.</p>
    </div>
  );
}
