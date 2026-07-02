/**
 * Shared Chart.js initialization — registers components once and returns the Chart class.
 * Both StatTab and OverallTab use this to avoid duplicate registrations.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chartClass: any = null;
let registrationPromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getChart(): Promise<any> {
  if (chartClass) return chartClass;

  if (!registrationPromise) {
    registrationPromise = import('chart.js').then(({
      Chart,
      CategoryScale, LinearScale,
      PointElement, LineElement, LineController,
      BarElement, BarController,
      ArcElement, DoughnutController,
      Tooltip, Legend,
    }) => {
      Chart.register(
        CategoryScale, LinearScale,
        PointElement, LineElement, LineController,
        BarElement, BarController,
        ArcElement, DoughnutController,
        Tooltip, Legend,
      );
      chartClass = Chart;
    });
  }

  await registrationPromise;
  return chartClass;
}

/**
 * Hook-friendly: load Chart.js and return it via state.
 * Usage:
 *   const [Chart, ready] = useChartJs();
 */
export function createChartLoader(
  setChart: (c: unknown) => void,
  setReady: (r: boolean) => void,
) {
  getChart().then(Chart => {
    setChart(Chart);
    setReady(true);
  });
}
