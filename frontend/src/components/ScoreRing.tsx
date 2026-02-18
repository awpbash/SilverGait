/**
 * ScoreRing — Apple Watch-inspired animated circular score display.
 * Reused across HomePage, ActivityPage, AssessmentPage result screen.
 */

interface ScoreRingProps {
  score: number;
  maxScore: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  sublabel?: string;
  animated?: boolean;
}

const SIZES = {
  sm: { dim: 56, stroke: 5, fontSize: '0.9rem', labelSize: '0.55rem' },
  md: { dim: 88, stroke: 6, fontSize: '1.25rem', labelSize: '0.65rem' },
  lg: { dim: 130, stroke: 8, fontSize: '1.8rem', labelSize: '0.75rem' },
};

function getColor(ratio: number): string {
  if (ratio >= 0.75) return '#34a853'; // green
  if (ratio >= 0.5) return '#f9ab00';  // amber
  return '#ea4335';                     // red
}

export function ScoreRing({
  score,
  maxScore,
  size = 'md',
  label,
  sublabel,
  animated = true,
}: ScoreRingProps) {
  const cfg = SIZES[size];
  const radius = (cfg.dim - cfg.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  const offset = circumference * (1 - ratio);
  const color = getColor(ratio);

  return (
    <div
      className="score-ring-wrapper"
      style={{ width: cfg.dim, height: cfg.dim, position: 'relative' }}
    >
      <svg
        width={cfg.dim}
        height={cfg.dim}
        viewBox={`0 0 ${cfg.dim} ${cfg.dim}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background track */}
        <circle
          cx={cfg.dim / 2}
          cy={cfg.dim / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={cfg.stroke}
          opacity={0.4}
        />
        {/* Animated fill */}
        <circle
          cx={cfg.dim / 2}
          cy={cfg.dim / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? offset : offset}
          style={animated ? {
            transition: 'stroke-dashoffset 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          } : undefined}
        />
      </svg>
      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span
          style={{
            fontSize: cfg.fontSize,
            fontWeight: 800,
            color: 'var(--text)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {score}/{maxScore}
        </span>
        {label && (
          <span
            style={{
              fontSize: cfg.labelSize,
              fontWeight: 700,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginTop: 2,
            }}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span
            style={{
              fontSize: cfg.labelSize,
              fontWeight: 600,
              color,
              marginTop: 1,
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
