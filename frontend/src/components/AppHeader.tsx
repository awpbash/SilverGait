import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores';
import { useT } from '../i18n';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'EN' },
  { value: 'mandarin', label: '中文' },
  { value: 'malay', label: 'BM' },
  { value: 'tamil', label: 'தமிழ்' },
];

interface AppHeaderProps {
  showBack?: boolean;
  backTo?: string;
}

export function AppHeader({ showBack, backTo }: AppHeaderProps) {
  const { preferredLanguage, setPreferredLanguage } = useUserStore();
  const navigate = useNavigate();
  const t = useT();

  return (
    <header className="app-header">
      {showBack ? (
        <button
          type="button"
          className="header-back-btn"
          onClick={() => backTo ? navigate(backTo) : window.history.back()}
          aria-label={t.common.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>{t.common.back}</span>
        </button>
      ) : (
        <div className="brand">
          <img src="/images/sg-health.svg" alt="SilverGait" className="brand-icon" />
          <span>SilverGait</span>
        </div>
      )}
      <div className="header-lang">
        <select
          value={preferredLanguage}
          onChange={(e) => setPreferredLanguage(e.target.value as typeof preferredLanguage)}
          aria-label="Select language"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </header>
  );
}
