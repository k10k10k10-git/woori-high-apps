import type { Chart } from 'chart.js';

export type ChartClass = typeof Chart;
type ChartModule = typeof import('chart.js');

/** 동시 요청은 함께 기다리고, 실패한 로딩은 다음 요청에서 다시 시도한다. */
export function createChartRegistry(loadModule: () => Promise<ChartModule>) {
  let chartClass: ChartClass | null = null;
  let registrationPromise: Promise<ChartClass> | null = null;

  return async function loadChart(): Promise<ChartClass> {
    if (chartClass) return chartClass;
    if (!registrationPromise) {
      registrationPromise = Promise.resolve().then(loadModule).then(({
        Chart,
        CategoryScale, LinearScale,
        PointElement, LineElement, LineController,
        BarElement, BarController,
        ArcElement, DoughnutController,
        Tooltip, Legend, Filler,
      }) => {
        Chart.register(
          CategoryScale, LinearScale,
          PointElement, LineElement, LineController,
          BarElement, BarController,
          ArcElement, DoughnutController,
          Tooltip, Legend, Filler,
        );
        chartClass = Chart;
        return Chart;
      }).catch(error => {
        registrationPromise = null;
        throw error;
      });
    }
    return registrationPromise;
  };
}

/** 차트 모듈과 구성 요소 등록은 화면 사이에서 한 번만 공유한다. */
export const getChart = createChartRegistry(() => import('chart.js'));

/** 화면 해제 뒤에는 로딩 결과를 전달하지 않는다. 반환 함수를 effect cleanup에 연결한다. */
export function createChartLoader(
  setChart: (chart: ChartClass) => void,
  setReady: (ready: boolean) => void,
  onError: (error: unknown) => void,
  loadChart: () => Promise<ChartClass> = getChart,
) {
  let active = true;
  Promise.resolve().then(loadChart).then(Chart => {
    if (!active) return;
    setChart(Chart);
    setReady(true);
  }).catch(error => {
    if (active) onError(error);
  });
  return () => { active = false; };
}
