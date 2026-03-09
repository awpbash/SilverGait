import { useUserStore } from '../stores';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'EN' },
  { value: 'mandarin', label: '中文' },
  { value: 'malay', label: 'BM' },
  { value: 'tamil', label: 'தமிழ்' },
];

export function AppHeader() {
  const { preferredLanguage, setPreferredLanguage } = useUserStore();

  return (
    <header className="app-header">
      <div className="brand">
        <img src="/images/sg-health.svg" alt="SilverGait" className="brand-icon" />
        <span>SilverGait</span>
      </div>
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
