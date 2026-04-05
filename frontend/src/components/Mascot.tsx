/**
 * Mascot — SilverGait turtle character.
 * Turtle = steady progress, longevity, protection.
 * Inline SVG using project color variables.
 */

interface MascotProps {
  size?: number;
  mood?: 'happy' | 'thinking' | 'encouraging';
  className?: string;
}

export function Mascot({ size = 48, mood = 'happy', className = '' }: MascotProps) {
  // Eye expression varies by mood
  const eyeOffset = mood === 'thinking' ? -0.5 : 0;
  const mouthPath = mood === 'happy'
    ? 'M10.5 16.5 Q12 18 13.5 16.5'   // smile
    : mood === 'encouraging'
    ? 'M10 16 Q12 18.5 14 16'           // bigger smile
    : 'M11 17 L13 17';                  // neutral for thinking

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`mascot ${className}`}
      aria-hidden="true"
    >
      {/* Shell (body) — sage green dome */}
      <ellipse cx="12" cy="13" rx="8" ry="7" fill="var(--olive-600)" />
      {/* Shell pattern — lighter segments */}
      <path d="M12 6 L10 10 L14 10 Z" fill="var(--olive-400)" opacity="0.5" />
      <path d="M8 9 L7 13 L10 11 Z" fill="var(--olive-400)" opacity="0.4" />
      <path d="M16 9 L17 13 L14 11 Z" fill="var(--olive-400)" opacity="0.4" />
      <path d="M9 14 L7 17 L11 15 Z" fill="var(--olive-400)" opacity="0.3" />
      <path d="M15 14 L17 17 L13 15 Z" fill="var(--olive-400)" opacity="0.3" />

      {/* Shell rim — darker edge */}
      <ellipse cx="12" cy="17" rx="7.5" ry="2.5" fill="var(--olive-700)" opacity="0.3" />

      {/* Head — olive/cream colored, poking out from top */}
      <ellipse cx="12" cy="7.5" rx="4" ry="3.5" fill="var(--olive-300)" />

      {/* Eyes */}
      <circle cx={10.2 + eyeOffset} cy="7" r="0.9" fill="var(--olive-900)" />
      <circle cx={13.8 + eyeOffset} cy="7" r="0.9" fill="var(--olive-900)" />
      {/* Eye highlights */}
      <circle cx={10.5 + eyeOffset} cy="6.6" r="0.3" fill="white" opacity="0.8" />
      <circle cx={14.1 + eyeOffset} cy="6.6" r="0.3" fill="white" opacity="0.8" />

      {/* Cheeks — warm blush */}
      {mood !== 'thinking' && (
        <>
          <circle cx="9" cy="8.5" r="1.2" fill="var(--olive-400)" opacity="0.3" />
          <circle cx="15" cy="8.5" r="1.2" fill="var(--olive-400)" opacity="0.3" />
        </>
      )}

      {/* Mouth */}
      <path d={mouthPath} stroke="var(--olive-800)" strokeWidth="0.6" strokeLinecap="round" fill="none" />

      {/* Front legs — little nubs */}
      <ellipse cx="6" cy="17.5" rx="1.8" ry="1.2" fill="var(--olive-300)" />
      <ellipse cx="18" cy="17.5" rx="1.8" ry="1.2" fill="var(--olive-300)" />

      {/* Tail — small bump at back */}
      <ellipse cx="20" cy="15" rx="1" ry="0.8" fill="var(--olive-300)" />
    </svg>
  );
}
