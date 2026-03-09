import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';
import { useT } from '../i18n';
import { useExerciseStats } from '../hooks/useExerciseStats';

interface MoreTile {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  route: string;
  accent: string;
  badge?: string;
}

export function MorePage() {
  const navigate = useNavigate();
  const t = useT();
  const stats = useExerciseStats(7);

  const tiles: MoreTile[] = [
    {
      id: 'report',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 17V13" /><path d="M12 17V9" /><path d="M17 17V11" />
        </svg>
      ),
      label: t.more.weeklyReport,
      description: t.more.weeklyReportDesc,
      route: '/report',
      accent: 'var(--olive-700)',
    },
    {
      id: 'community',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      label: t.more.challenges,
      description: t.more.challengesDesc,
      route: '/community',
      accent: '#3478f6',
    },
    {
      id: 'caregiver',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
      label: t.more.caregiver,
      description: t.more.caregiverDesc,
      route: '/caregiver',
      accent: '#e8475f',
    },
    {
      id: 'help',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r=".5" fill="currentColor" />
        </svg>
      ),
      label: t.more.helpSafety,
      description: t.more.helpSafetyDesc,
      route: '/help',
      accent: '#ff9f0a',
    },
  ];

  return (
    <div className="page more-page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.more.title}</h1>
      </div>

      {/* Streak banner */}
      {stats.streak > 0 && (
        <div className="more-streak-banner">
          <div className="more-streak-flame">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 23c-4.97 0-8-3.03-8-7 0-2.45.85-4.17 2-5.5.6-.7 1.3-1.2 1.95-1.65.15-.1.3.1.2.25-.5.75-.65 1.65-.15 2.65.1.2.35.2.4-.02.4-1.6 1.6-3.4 3.6-4.73 2-1.35 2.8-3.1 2.8-3.1s.5 1.6.5 3.6c0 1.1-.35 2.1-.85 2.85-.1.15.08.32.22.22.75-.5 1.63-1.45 2.08-2.57.1-.25.45-.2.45.07 0 2-.6 3.55-1.2 4.53-.5.8-.45 1.8.2 2.45.1.1.25.05.28-.08.15-.65.1-1.4-.2-2.1-.05-.12.1-.22.2-.15C18.25 13.2 20 15.15 20 17c0 3.55-3.03 6-8 6z" fill="#ff9f0a" />
            </svg>
          </div>
          <div className="more-streak-text">
            <strong>{stats.streak}-day streak</strong>
            <span>{stats.todayCompleted.length} exercises today</span>
          </div>
        </div>
      )}

      {/* Tile grid */}
      <div className="more-tiles">
        {tiles.map((tile, i) => (
          <button
            key={tile.id}
            className="more-tile"
            onClick={() => navigate(tile.route)}
            style={{ '--tile-accent': tile.accent, animationDelay: `${i * 60}ms` } as React.CSSProperties}
          >
            <div className="more-tile-icon">
              {tile.icon}
            </div>
            <div className="more-tile-content">
              <strong>{tile.label}</strong>
              <span>{tile.description}</span>
            </div>
            <svg className="more-tile-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>

      {/* Emergency footer */}
      <div className="more-emergency">
        <a href="tel:995" className="more-emergency-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Emergency: 995
        </a>
      </div>
    </div>
  );
}
