"use client";

import { useMemo } from "react";

export type PointChartRange = "30" | "90" | "all";

type PointHistoryAward = {
  points: number;
  earnedOn: string;
};

type PointHistorySectionProps = {
  awards: PointHistoryAward[];
  clockTime: number;
  range: PointChartRange;
  studyPoints: number;
  onRangeChange: (range: PointChartRange) => void;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChartDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function PointHistorySection({
  awards,
  clockTime,
  range,
  studyPoints,
  onRangeChange,
}: PointHistorySectionProps) {
  const pointChart = useMemo(() => {
    const chartNow = new Date(clockTime);
    const byDate = new Map<string, number>();
    awards.forEach((award) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(award.earnedOn)) {
        byDate.set(award.earnedOn, (byDate.get(award.earnedOn) ?? 0) + award.points);
      }
    });

    const dates = [...byDate.keys()].sort();
    const rangeDays = range === "all" ? null : Number(range);
    const earliest = dates[0] ? new Date(`${dates[0]}T12:00:00`) : chartNow;
    const start = new Date(rangeDays ? chartNow.getTime() - (rangeDays - 1) * 86400000 : earliest.getTime());
    start.setHours(12, 0, 0, 0);
    const end = new Date(chartNow);
    end.setHours(12, 0, 0, 0);
    const naturalDayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (naturalDayCount < 2) start.setDate(start.getDate() - (2 - naturalDayCount));
    const startKey = localDateKey(start);
    const beforeRange = dates
      .filter((date) => date < startKey)
      .reduce((sum, date) => sum + (byDate.get(date) ?? 0), 0);
    const dayCount = Math.max(2, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const points = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = localDateKey(date);
      const gained = byDate.get(key) ?? 0;
      const total = beforeRange + dates
        .filter((dateKey) => dateKey >= startKey && dateKey <= key)
        .reduce((sum, dateKey) => sum + (byDate.get(dateKey) ?? 0), 0);
      return { key, date, total, gained };
    });
    const max = Math.max(studyPoints, ...points.map((point) => point.total), 1);
    const width = 720;
    const height = 220;
    const padding = { top: 20, right: 16, bottom: 31, left: 48 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const plotPoints = points.map((point, index) => ({
      ...point,
      x: padding.left + (index / (points.length - 1)) * innerWidth,
      y: padding.top + innerHeight - (point.total / max) * innerHeight,
    }));
    const path = plotPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(" ");
    return { height, width, padding, innerHeight, max, path, points: plotPoints, start, end };
  }, [awards, clockTime, range, studyPoints]);

  return (
    <section className="point-chart-section" aria-labelledby="point-chart-title">
      <div className="section-heading">
        <div><p className="eyebrow">POINT HISTORY</p><h3 id="point-chart-title">累計ポイントの推移</h3></div>
        <div className="point-chart-range" aria-label="表示期間">
          {(["30", "90", "all"] as PointChartRange[]).map((chartRange) => (
            <button
              key={chartRange}
              className={range === chartRange ? "active" : ""}
              onClick={() => onRangeChange(chartRange)}
            >
              {chartRange === "all" ? "すべて" : `${chartRange}日`}
            </button>
          ))}
        </div>
      </div>
      <article className="point-chart-card">
        <div className="point-chart-summary">
          <div><strong>{studyPoints}<small> pt</small></strong><span>現在の累計</span></div>
          <p>{pointChart.start.getFullYear()}年{pointChart.start.getMonth() + 1}月{pointChart.start.getDate()}日 〜 {pointChart.end.getMonth() + 1}月{pointChart.end.getDate()}日</p>
        </div>
        <div className="point-chart-scroll">
          <svg className="point-chart" viewBox={`0 0 ${pointChart.width} ${pointChart.height}`} role="img" aria-label={`累計ポイント ${studyPoints}ポイントの推移グラフ`}>
            {[0, 1, 2, 3, 4].map((step) => {
              const value = Math.round(pointChart.max * (1 - step / 4));
              const y = pointChart.padding.top + pointChart.innerHeight * (step / 4);
              return <g key={step}><line x1={pointChart.padding.left} x2={pointChart.width - pointChart.padding.right} y1={y} y2={y} /><text x={pointChart.padding.left - 9} y={y + 4}>{value}</text></g>;
            })}
            <path className="point-chart-area" d={`${pointChart.path} L${pointChart.points.at(-1)?.x},${pointChart.padding.top + pointChart.innerHeight} L${pointChart.points[0]?.x},${pointChart.padding.top + pointChart.innerHeight} Z`} />
            <path className="point-chart-line" d={pointChart.path} />
            {pointChart.points.filter((point) => point.gained > 0).map((point) => (
              <circle key={point.key} cx={point.x} cy={point.y} r="4">
                <title>{`${formatChartDate(point.date)}：+${point.gained} pt、累計 ${point.total} pt`}</title>
              </circle>
            ))}
            <text className="point-chart-date" x={pointChart.padding.left} y={pointChart.height - 8}>{formatChartDate(pointChart.start)}</text>
            <text className="point-chart-date" x={pointChart.width - pointChart.padding.right} y={pointChart.height - 8} textAnchor="end">{formatChartDate(pointChart.end)}</text>
          </svg>
        </div>
        <p className="point-chart-note">点に触れると、その日に獲得したポイントと累計を確認できます。</p>
      </article>
    </section>
  );
}
