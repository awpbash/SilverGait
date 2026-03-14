/**
 * MovementGraph — SVG line chart for physiotherapist detail view.
 * Shows time-series data (hip Y for sit-to-stand, sway for balance, etc.)
 */

import { useMemo } from 'react';
import { useT } from '../i18n';

interface MovementGraphProps {
  /** Time values in seconds */
  time: number[];
  /** Data values (nullable — gaps are handled) */
  values: (number | null)[];
  /** Chart title */
  title: string;
  /** Y-axis label */
  yLabel?: string;
  /** Color theme */
  color?: string;
  /** Invert Y axis (useful for hip Y where lower = standing) */
  invertY?: boolean;
  /** Height in pixels */
  height?: number;
  /** Optional annotations (e.g., rep markers) */
  annotations?: { time: number; label: string }[];
}

const PADDING = { top: 28, right: 16, bottom: 32, left: 44 };

export function MovementGraph({
  time,
  values,
  title,
  yLabel,
  color = '#FFB74D',
  invertY = false,
  height = 180,
  annotations,
}: MovementGraphProps) {
  const t = useT();
  const width = 360; // SVG viewBox width, scales responsively

  const { path, areaPath, yTicks, xTicks, validPoints } = useMemo(() => {
    // Filter valid data points
    const pts: { t: number; v: number; idx: number }[] = [];
    for (let i = 0; i < time.length; i++) {
      if (values[i] !== null && values[i] !== undefined) {
        pts.push({ t: time[i], v: values[i] as number, idx: i });
      }
    }
    if (pts.length < 2) return { path: '', areaPath: '', yMin: 0, yMax: 1, yTicks: [], xTicks: [], validPoints: [] };

    const tMin = pts[0].t;
    const tMax = pts[pts.length - 1].t;
    let vMin = Math.min(...pts.map(p => p.v));
    let vMax = Math.max(...pts.map(p => p.v));
    // Add 10% padding to Y range
    const vPad = (vMax - vMin) * 0.1 || 1;
    vMin -= vPad;
    vMax += vPad;

    const chartW = width - PADDING.left - PADDING.right;
    const chartH = height - PADDING.top - PADDING.bottom;

    const scaleX = (t: number) => PADDING.left + ((t - tMin) / (tMax - tMin || 1)) * chartW;
    const scaleY = (v: number) => {
      const norm = (v - vMin) / (vMax - vMin || 1);
      return invertY
        ? PADDING.top + norm * chartH
        : PADDING.top + (1 - norm) * chartH;
    };

    // Build SVG path
    const mapped = pts.map(p => ({ x: scaleX(p.t), y: scaleY(p.v), t: p.t, v: p.v }));
    const d = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Area fill path (line + close to bottom)
    const bottomY = invertY ? PADDING.top : PADDING.top + chartH;
    const topY = invertY ? PADDING.top + chartH : PADDING.top;
    const baseY = invertY ? topY : bottomY;
    const area = d + ` L${mapped[mapped.length - 1].x.toFixed(1)},${baseY} L${mapped[0].x.toFixed(1)},${baseY} Z`;

    // Y-axis ticks (4 ticks)
    const yTickVals: number[] = [];
    for (let i = 0; i <= 3; i++) {
      yTickVals.push(vMin + ((vMax - vMin) * i) / 3);
    }

    // X-axis ticks (every ~3 seconds)
    const xTickVals: number[] = [];
    const step = Math.max(1, Math.ceil((tMax - tMin) / 5));
    for (let t = Math.ceil(tMin); t <= tMax; t += step) {
      xTickVals.push(t);
    }

    return {
      path: d,
      areaPath: area,
      yMin: vMin,
      yMax: vMax,
      yTicks: yTickVals.map(v => ({ v, y: scaleY(v) })),
      xTicks: xTickVals.map(t => ({ t, x: scaleX(t) })),
      validPoints: mapped,
    };
  }, [time, values, width, height, invertY]);

  if (validPoints.length < 2) {
    return (
      <div className="movement-graph">
        <p className="movement-graph-title">{title}</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
          {t.graph.notEnoughData}
        </p>
      </div>
    );
  }

  return (
    <div className="movement-graph">
      <p className="movement-graph-title">{title}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto' }}
      >
        {/* Grid lines */}
        {yTicks.map(({ v, y }, i) => (
          <g key={`y-${i}`}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={width - PADDING.right}
              y2={y}
              stroke="var(--border)"
              strokeWidth={0.5}
              strokeDasharray="3,3"
            />
            <text
              x={PADDING.left - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="8"
              fill="var(--muted)"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTicks.map(({ t, x }, i) => (
          <text
            key={`x-${i}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            fontSize="8"
            fill="var(--muted)"
          >
            {t.toFixed(0)}s
          </text>
        ))}

        {/* Y-axis label */}
        {yLabel && (
          <text
            x={10}
            y={PADDING.top - 10}
            fontSize="8"
            fill="var(--muted)"
            fontWeight={600}
          >
            {yLabel}
          </text>
        )}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.12} />

        {/* Main line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glow line (subtle) */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.15}
        />

        {/* Annotation markers (rep peaks, etc.) */}
        {annotations?.map((ann, i) => {
          const closest = validPoints.reduce((best, p) =>
            Math.abs(p.t - ann.time) < Math.abs(best.t - ann.time) ? p : best
          );
          return (
            <g key={`ann-${i}`}>
              <circle cx={closest.x} cy={closest.y} r={4} fill={color} />
              <circle cx={closest.x} cy={closest.y} r={6} fill={color} opacity={0.3} />
              <text
                x={closest.x}
                y={closest.y - 10}
                textAnchor="middle"
                fontSize="8"
                fontWeight={700}
                fill={color}
              >
                {ann.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
