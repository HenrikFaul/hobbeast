import { useMemo } from 'react';
import { type ElevationPoint, formatDistance } from '@/lib/mapyCz';

interface ElevationChartProps {
  elevations: ElevationPoint[];
  totalDistanceM: number;
}

export function ElevationChart({ elevations, totalDistanceM }: ElevationChartProps) {
  const { points, minAlt, maxAlt } = useMemo(() => {
    if (elevations.length === 0) return { points: '', minAlt: 0, maxAlt: 0 };

    const alts = elevations.map(e => e.altitude);
    const minA = Math.floor(Math.min(...alts) / 10) * 10;
    const maxA = Math.ceil(Math.max(...alts) / 10) * 10;
    const range = maxA - minA || 1;

    const width = 400;
    const height = 120;
    const padding = { top: 10, bottom: 25, left: 45, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const pts = elevations.map((e, i) => {
      const x = padding.left + (i / (elevations.length - 1)) * chartW;
      const y = padding.top + chartH - ((e.altitude - minA) / range) * chartH;
      return `${x},${y}`;
    });

    return { points: pts.join(' '), minAlt: minA, maxAlt: maxA };
  }, [elevations]);

  if (elevations.length < 2) return null;

  const width = 400;
  const height = 120;
  const padding = { top: 10, bottom: 25, left: 45, right: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Fill area
  const fillPoints = `${padding.left},${padding.top + chartH} ${points} ${padding.left + chartW},${padding.top + chartH}`;

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Szintprofil</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = padding.top + chartH * (1 - frac);
          const alt = Math.round(minAlt + (maxAlt - minAlt) * frac);
          return (
            <g key={frac}>
              <line x1={padding.left} y1={y} x2={padding.left + chartW} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={padding.left - 4} y={y + 3} textAnchor="end" fontSize="8" fill="hsl(var(--muted-foreground))">{alt} m</text>
            </g>
          );
        })}

        {/* Distance labels */}
        {[0, 0.5, 1].map(frac => {
          const x = padding.left + chartW * frac;
          return (
            <text key={frac} x={x} y={height - 5} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))">
              {formatDistance(totalDistanceM * frac)}
            </text>
          );
        })}

        {/* Fill */}
        <polygon points={fillPoints} fill="hsl(var(--primary) / 0.15)" />
        {/* Line */}
        <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
