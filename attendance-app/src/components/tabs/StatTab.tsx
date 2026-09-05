'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useClassKey } from '@/store/AppContext';
import { evKey } from '@/utils/dates';
import { getChart } from '@/utils/chartSetup';
import ClassTabBar from '@/components/ClassTabBar';
import { SHOW_ATTENDANCE_RISK_SECTIONS } from '@/lib/releaseFlags';
import { buildClassStats } from '@/utils/classStats';
import {
  activeAndLongAbsentStudents,
  consecutiveAbsentStudentIds,
  recentEditableWeeks,
  unenteredStudentIds,
} from '@/utils/attendanceWorkflow';

// 모바일에서 롤오버 없이도 숫자를 항상 표시하는 커스텀 플러그인
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataLabelPlugin: any = {
  id: 'dataLabels',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    if (chart.config.type === 'doughnut') return;
    if ((chart.options.scales as any)?.y?.stacked) return; // 스택 바는 별도 플러그인이 처리
    chart.data.datasets.forEach((_: unknown, i: number) => {
      const meta = chart.getDatasetMeta(i);
      if (!meta.visible) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meta.data.forEach((element: any, j: number) => {
        const value = chart.data.datasets[i].data[j] as number;
        if (!value) return;
        const isBar = chart.config.type === 'bar';
        const label = chart.config.type === 'line' ? `${value}%` : String(value);
        ctx.save();
        if (isBar) {
          const barHeight = element.base - element.y;
          if (barHeight >= 18) {
            // 바 내부 중앙에 흰 글씨
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, element.x, element.y + barHeight / 2);
          } else if (barHeight > 0) {
            // 바 위에 어두운 글씨
            ctx.fillStyle = '#374151';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, element.x, element.y - 2);
          }
        } else {
          // 라인 차트: 포인트 위에 표시
          ctx.fillStyle = '#374151';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, element.x, element.y - 5);
        }
        ctx.restore();
      });
    });
  },
};
export default function StatTab() {
  const { state } = useApp();
  const { curYear, months, attData, classData, events, curView } = state;
  const ck = useClassKey(state);
  const allStudents = useMemo(() => classData[ck]?.students ?? [], [classData, ck]);
  const { active: students, longAbsent: longAbsentStudents } = useMemo(
    () => activeAndLongAbsentStudents(allStudents),
    [allStudents],
  );
  const recentWeeks = useMemo(
    () => recentEditableWeeks(curYear, months, events, Date.now(), 4),
    [curYear, months, events],
  );
  const missingIds = useMemo(
    () => unenteredStudentIds(students, attData[ck], recentWeeks[0]?.key),
    [students, attData, ck, recentWeeks],
  );
  const repeatedAbsentIds = useMemo(
    () => consecutiveAbsentStudentIds(students, attData[ck], recentWeeks.map(week => week.key), 3),
    [students, attData, ck, recentWeeks],
  );
  const studentNames = useMemo(
    () => new Map(allStudents.map(student => [student.id, student.name])),
    [allStudents],
  );
  const namesFor = (ids: string[]) => ids.slice(0, 5).map(id => studentNames.get(id)).filter(Boolean).join(', ');

  const [warningOpen, setWarningOpen] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartJsRef = useRef<any>(null);
  const [chartJsReady, setChartJsReady] = useState(false);

  useEffect(() => {
    getChart().then(Chart => {
      // Register local plugin for data labels (StatTab-specific)
      Chart.register(dataLabelPlugin);
      chartJsRef.current = Chart;
      setChartJsReady(true);
    });
  }, []);

  const classStats = useMemo(
    () => buildClassStats({ months, curView, attData, events }, ck, students),
    [months, curView, attData, events, ck, students],
  );
  const { warningStudents } = classStats;

  const chart1Ref = useRef<HTMLCanvasElement>(null);
  const chart2Ref = useRef<HTMLCanvasElement>(null);
  const chart3Ref = useRef<HTMLCanvasElement>(null);
  const chart4Ref = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstances = useRef<any[]>([]);
  // 스택 바 클릭 상태 (어떤 학생의 어떤 데이터셋을 탭했는지)
  const barClickRef = useRef<{ j: number; dsIdx: number } | null>(null);

  // canvas에 이미 Chart 인스턴스가 있으면 파괴 후 새로 생성
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function safeChart(canvas: HTMLCanvasElement | null, config: any): any | null {
    const ChartClass = chartJsRef.current;
    if (!canvas || !ChartClass) return null;
    const existing = ChartClass.getChart(canvas);
    if (existing) existing.destroy();
    return new ChartClass(canvas, config);
  }

  useEffect(() => {
    if (!chartJsReady) return;
    // 기존 인스턴스 정리
    chartInstances.current.forEach(c => { try { c.destroy(); } catch { /* ignore */ } });
    chartInstances.current = [];

    if (students.length === 0) return;

    const viewMonths = months.filter(({ month }) => {
      if (curView === 'first') return month >= 1 && month <= 6;
      if (curView === 'second') return month >= 7 && month <= 12;
      return true;
    });

    const labels = viewMonths.map(m => `${m.month}월`);

    // 월별 평균 출석률
    const monthlyRates: (number | null)[] = viewMonths.map(({ month, sundays }) => {
      const mi = months.findIndex(m => m.month === month);
      const weekKeys = sundays.map((_, di) => evKey(mi, di)).filter(k => !events[k]);
      if (weekKeys.length === 0) return null;
      const hasAnyData = students.some(s => weekKeys.some(k => attData[ck]?.[s.id]?.[k] !== undefined));
      if (!hasAnyData) return null;
      const totalRate = students.reduce((sum, s) => {
        let p = 0;
        weekKeys.forEach(k => { if ((attData[ck]?.[s.id]?.[k] ?? '') === 'O') p++; });
        return sum + (weekKeys.length > 0 ? (p / weekKeys.length) * 100 : 0);
      }, 0);
      return Math.round(totalRate / students.length);
    });

    // Chart 1: 월별 출석률 (라인)
    const c1 = safeChart(chart1Ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '평균 출석률(%)',
          data: monthlyRates,
          borderColor: '#9B8DD4',
          backgroundColor: 'rgba(155,141,212,.15)',
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100 } },
      },
    });
    if (c1) chartInstances.current.push(c1);

    // Chart 2: 학생별 출석 현황 (스택 바) — 클릭 시 보완 데이터 표시
    barClickRef.current = null; // 클래스 변경 시 초기화
    if (students.length > 0) {
      const canvas2 = chart2Ref.current;
      // 클릭 시 보완 지표를 막대 상단에 그리는 로컬 플러그인
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // 스택 바 각 세그먼트 내부에 숫자 항상 표시
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stackedSegmentLabelPlugin: any = {
        id: 'stackedSegmentLabels',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterDatasetsDraw(ch: any) {
          const { ctx } = ch;
          ch.data.datasets.forEach((_: unknown, i: number) => {
            const meta = ch.getDatasetMeta(i);
            if (!meta.visible) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            meta.data.forEach((el: any, j: number) => {
              const value = ch.data.datasets[i].data[j] as number;
              if (!value) return;
              const segH = el.base - el.y;
              if (segH < 14) return;
              ctx.save();
              ctx.fillStyle = 'rgba(255,255,255,0.9)';
              ctx.font = `bold ${segH >= 20 ? 11 : 10}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(value), el.x, el.y + segH / 2);
              ctx.restore();
            });
          });
        },
      };

      const stackedClickPlugin: any = {
        id: 'stackedClickLabel',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterDatasetsDraw(ch: any) {
          const active = barClickRef.current;
          if (!active) return;
          const { ctx } = ch;
          const { j, dsIdx } = active;
          // 클릭한 데이터셋의 보완: 출석(0) → 결석(1), 결석(1) → 출석(0)
          const compIdx = dsIdx === 0 ? 1 : dsIdx === 1 ? 0 : -1;
          if (compIdx < 0) return;
          const compVal = (ch.data.datasets[compIdx]?.data[j] ?? 0) as number;
          const isCompAbs = compIdx === 1;
          const label = isCompAbs ? `결석 ${compVal}` : `출석 ${compVal}`;
          const color  = isCompAbs ? '#ef4444' : '#10b981';
          const topMeta = ch.getDatasetMeta(ch.data.datasets.length - 1);
          const el = topMeta.data[j];
          if (!el) return;
          ctx.save();
          ctx.fillStyle = color;
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, el.x, el.y - 3);
          ctx.restore();
        },
      };
      const c2 = safeChart(canvas2, {
        type: 'bar',
        data: {
          labels: students.map(s => s.name),
          datasets: [
            { label: '출석', data: classStats.present, backgroundColor: '#10b981' },
            { label: '결석', data: classStats.absent,  backgroundColor: '#ef4444' },
            { label: '지각', data: classStats.tardy, backgroundColor: '#f59e0b' },
          ],
        },
        plugins: [stackedSegmentLabelPlugin, stackedClickPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick: (_e: any, elements: any[]) => {
            if (elements.length > 0) {
              barClickRef.current = { j: elements[0].index, dsIdx: elements[0].datasetIndex };
            } else {
              barClickRef.current = null;
            }
            chartJsRef.current?.getChart(canvas2!)?.update('none');
          },
        },
      });
      if (c2) chartInstances.current.push(c2);
    }

    // Chart 3: 출석 등급 분포 (도넛) - A/B/C/D 등급별 인원
    // 미래 주차를 제외하고 실제 기록된 주차(O/X/T)만 분모로 사용
    const { gradeCounts } = classStats;
    const c3 = safeChart(chart3Ref.current, {
      type: 'doughnut',
      data: {
        labels: [
          `A등급 ${gradeCounts.A}명`,
          `B등급 ${gradeCounts.B}명`,
          `C등급 ${gradeCounts.C}명`,
          `D등급 ${gradeCounts.D}명`,
        ],
        datasets: [{
          data: [gradeCounts.A, gradeCounts.B, gradeCounts.C, gradeCounts.D],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      },
    });
    if (c3) chartInstances.current.push(c3);

    // Chart 4: 주차별 출석 인원 (바)
    const allWeekKeys: string[] = [];
    const weekLabels: string[] = [];
    months.forEach(({ month, sundays }, mi) => {
      const monthNum = month;
      if (curView === 'first' && !(monthNum >= 1 && monthNum <= 6)) return;
      if (curView === 'second' && !(monthNum >= 7 && monthNum <= 12)) return;
      sundays.forEach((day, di) => {
        const k = evKey(mi, di);
        if (!events[k]) {
          allWeekKeys.push(k);
          weekLabels.push(`${month}/${day}`);
        }
      });
    });
    const weekCounts = allWeekKeys.map(k =>
      students.filter(s => (attData[ck]?.[s.id]?.[k] ?? '') === 'O').length
    );
    if (allWeekKeys.length > 0) {
      const c4 = safeChart(chart4Ref.current, {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [{
            label: '출석 인원',
            data: weekCounts,
            backgroundColor: '#9B8DD4',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index' as const, intersect: false },
          plugins: { legend: { display: false } },
          scales: { y: { min: 0, max: students.length } },
        },
      });
      if (c4) chartInstances.current.push(c4);
    }

    return () => {
      chartInstances.current.forEach(c => { try { c.destroy(); } catch { /* ignore */ } });
      chartInstances.current = [];
    };
  }, [ck, curView, attData, months, events, students, classStats, chartJsReady]);

  return (
    <div>
      {/* 반 탭 */}
      <ClassTabBar />

      {allStudents.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40, fontSize: 13 }}>
          학생 데이터가 없습니다.
        </div>
      ) : (
        <>
          <section className="attendance-action-section" aria-labelledby="attendance-action-title">
            <div className="attendance-action-heading">
              <div>
                <h2 id="attendance-action-title">목양 확인</h2>
                <p>통계 수치보다 먼저 확인할 실제 후속 업무입니다.</p>
              </div>
              <span>{recentWeeks[0]?.label ?? '최근 출석 없음'} 기준</span>
            </div>
            <div className="attendance-action-grid">
              <article className="attendance-action-card missing">
                <span>미입력 확인</span>
                <strong>{missingIds.length}명</strong>
                <p>{missingIds.length ? namesFor(missingIds) + (missingIds.length > 5 ? ` 외 ${missingIds.length - 5}명` : '') : '모두 입력되었습니다.'}</p>
              </article>
              <article className="attendance-action-card absent">
                <span>최근 3회 연속 결석</span>
                <strong>{repeatedAbsentIds.length}명</strong>
                <p>{repeatedAbsentIds.length ? namesFor(repeatedAbsentIds) + (repeatedAbsentIds.length > 5 ? ` 외 ${repeatedAbsentIds.length - 5}명` : '') : '확인 대상이 없습니다.'}</p>
              </article>
              <article className="attendance-action-card long">
                <span>장결 별도 관리</span>
                <strong>{longAbsentStudents.length}명</strong>
                <p>{longAbsentStudents.length ? longAbsentStudents.slice(0, 5).map(student => student.name).join(', ') + (longAbsentStudents.length > 5 ? ` 외 ${longAbsentStudents.length - 5}명` : '') : '장결자가 없습니다.'}</p>
              </article>
            </div>
          </section>
          {students.length > 0 && (
            <div className="charts-container">
              {SHOW_ATTENDANCE_RISK_SECTIONS && (
                <div className="chart-card">
                  <div className="chart-title">출석 등급 분포</div>
                  <div className="chart-canvas-wrap"><canvas ref={chart3Ref} /></div>
                </div>
              )}
              <div className="chart-card">
                <div className="chart-title">학생별 출석 현황</div>
                <div className="chart-canvas-wrap"><canvas ref={chart2Ref} /></div>
              </div>
              <div className="chart-card">
                <div className="chart-title">월별 평균 출석률</div>
                <div className="chart-canvas-wrap"><canvas ref={chart1Ref} /></div>
              </div>
              <div className="chart-card">
                <div className="chart-title">주차별 출석 인원</div>
                <div className="chart-canvas-wrap"><canvas ref={chart4Ref} /></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 주의 학생 목록 */}
      {SHOW_ATTENDANCE_RISK_SECTIONS && students.length > 0 && (
        <div className="warning-card">
          <button className="warning-card-header" onClick={() => setWarningOpen(o => !o)}>
            <span className="warning-card-title">
              주의 학생
              <span className="warning-badge">{warningStudents.length}명</span>
            </span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>출석률 50% 미만 {warningOpen ? '▲' : '▼'}</span>
          </button>
          {warningOpen && (
            warningStudents.length === 0 ? (
              <div style={{ padding: '14px 16px', color: 'var(--text3)', fontSize: 13 }}>
                주의 학생이 없습니다.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['이름', '출석률', '등급', '결석', '지각'].map(h => (
                        <th key={h} style={{ padding: '7px 12px', fontWeight: 600, color: 'var(--text2)', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {warningStudents.map((s, i) => (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : 'var(--surface2)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'center' }}>{s.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: s.rate < 70 ? '#ef4444' : '#f59e0b' }}>{s.rate}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                            background: s.grade === 'C' ? '#fef3c7' : '#fee2e2',
                            color: s.grade === 'C' ? '#d97706' : '#dc2626',
                          }}>{s.grade}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#ef4444' }}>{s.absent}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#f59e0b' }}>{s.tardy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
