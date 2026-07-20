import { memo, useEffect, useRef, useState } from "react";
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import type { Plugin, Scale } from "chart.js";

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
);

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    textColor:   style.getPropertyValue('--text-secondary').trim() || '#6a8baa',
    gridColor:   style.getPropertyValue('--border-steel').trim()   || '#1a3a5a',
    tooltipBg:   style.getPropertyValue('--bg-elevated').trim()    || '#0c1020',
    tooltipText: style.getPropertyValue('--text-primary').trim()   || '#e8f4fd',
  };
}

export interface SeriesConfig {
  label: string;
  color: string;
  data: { x: number; y: number }[];
  fill?: boolean;
  dashed?: boolean;
}

interface Props {
  type?: "line" | "bar";
  series: SeriesConfig[];
  windowSeconds?: number;
  yMin?: number;
  yMax?: number;
  height?: number;
  thresholdBand?: { from: number; to: number };
}

function RealtimeChartImpl({
  type = "line",
  series,
  windowSeconds = 60,
  yMin,
  yMax,
  height = 160,
  thresholdBand,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          setThemeKey(k => k + 1);
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const colors = getChartColors();
    const ctx = ref.current.getContext("2d")!;
    const now = Date.now();
    const thresholdPlugin: Plugin = {
      id: "threshold-band",
      beforeDatasetsDraw: (chart) => {
        if (!thresholdBand) return;
        const yScale = chart.scales.y as Scale | undefined;
        const { chartArea } = chart;
        if (!yScale || !chartArea) return;
        const top = yScale.getPixelForValue(thresholdBand.to);
        const bottom = yScale.getPixelForValue(thresholdBand.from);
        chart.ctx.save();
        chart.ctx.fillStyle = "rgba(255,45,85,0.12)";
        chart.ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
        chart.ctx.restore();
      },
    };
    chartRef.current = new Chart(ctx, {
      type,
      plugins: [thresholdPlugin],
      data: {
        datasets: series.map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: s.fill ? s.color + "22" : type === "bar" ? s.color + "cc" : s.color,
          borderWidth: 1.5,
          borderDash: s.dashed ? [4, 4] : undefined,
          pointRadius: 0,
          tension: 0.25,
          fill: !!s.fill,
        })),
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: {
            display: series.length > 1,
            labels: {
              color: colors.textColor,
              font: { size: 10, family: "JetBrains Mono" },
              boxWidth: 8,
              boxHeight: 8,
            },
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.tooltipText,
            bodyColor: colors.tooltipText,
            borderColor: "#00D4FF",
            borderWidth: 1,
            titleFont: { family: "JetBrains Mono" },
            bodyFont: { family: "JetBrains Mono" },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: now - windowSeconds * 1000,
            max: now,
            grid: { color: colors.gridColor + '33' },
            ticks: {
              color: colors.textColor,
              font: { size: 9, family: "JetBrains Mono" },
              callback: (v: any) => {
                const d = new Date(v);
                return `${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
              },
              maxTicksLimit: 6,
            },
          },
          y: {
            min: yMin,
            max: yMax,
            grid: { color: colors.gridColor + '33' },
            ticks: { color: colors.textColor, font: { size: 9, family: "JetBrains Mono" } },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, thresholdBand?.from, thresholdBand?.to, themeKey]);

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const now = Date.now();
    series.forEach((s, i) => {
      if (c.data.datasets[i]) c.data.datasets[i].data = s.data as any;
    });
    if (c.options.scales?.x) {
      (c.options.scales.x as any).min = now - windowSeconds * 1000;
      (c.options.scales.x as any).max = now;
    }
    c.update("none");
  }, [series, windowSeconds]);

  void thresholdBand;
  return (
    <div style={{ height }} className="w-full">
      <canvas ref={ref} />
    </div>
  );
}

export const RealtimeChart = memo(RealtimeChartImpl);
