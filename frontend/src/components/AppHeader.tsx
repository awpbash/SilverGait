import { useUiStore, useUserStore } from '../stores';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'singlish', label: 'Singlish' },
  { value: 'mandarin', label: 'Mandarin' },
  { value: 'malay', label: 'Bahasa Melayu' },
  { value: 'cantonese', label: 'Cantonese' },
  { value: 'hokkien', label: 'Hokkien' },
];

export function AppHeader() {
  const { preferredLanguage, setPreferredLanguage } = useUserStore();
  const { viewMode, setViewMode } = useUiStore();

  return (
    <header className="app-header">
      <div className="brand">
        <img
          src="/images/sg-health.svg"
          alt="SilverGait"
          className="brand-icon"
        />
        <span>SilverGait</span>
      </div>

      <div className="header-actions">
        <label className="language-select">
          <span className="language-label">Select Language</span>
          <div className="language-control">
            <select
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value as typeof preferredLanguage)}
              aria-label="Select language"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M5.5 7.5l4.5 4.5 4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </label>

        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'mobile' ? 'active' : ''}
            onClick={() => setViewMode('mobile')}
          >
            Mobile
          </button>
          <button
            type="button"
            className={viewMode === 'desktop' ? 'active' : ''}
            onClick={() => setViewMode('desktop')}
          >
            Desktop
          </button>
        </div>
      </div>
    </header>
  );
}
