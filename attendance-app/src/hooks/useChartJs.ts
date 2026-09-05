'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createChartLoader, type ChartClass } from '@/utils/chartSetup';

export function useChartJs(initialize?: (chart: ChartClass) => void) {
  const chartJsRef = useRef<ChartClass | null>(null);
  const [chartJsReady, setChartJsReady] = useState(false);
  const [chartLoadError, setChartLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => createChartLoader(Chart => {
    initialize?.(Chart);
    chartJsRef.current = Chart;
  }, setChartJsReady, () => setChartLoadError(true)), [attempt, initialize]);

  const retryChart = useCallback(() => {
    setChartLoadError(false);
    setChartJsReady(false);
    setAttempt(value => value + 1);
  }, []);

  return { chartJsRef, chartJsReady, chartLoadError, retryChart };
}
