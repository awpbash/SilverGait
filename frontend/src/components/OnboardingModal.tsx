import { useState } from 'react';
import { useUserStore } from '../stores';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'singlish', label: 'Singlish' },
  { value: 'mandarin', label: '中文 (Mandarin)' },
  { value: 'cantonese', label: '廣東話 (Cantonese)' },
  { value: 'hokkien', label: 'Hokkien' },
  { value: 'malay', label: 'Bahasa Melayu' },
] as const;

export function OnboardingModal() {
  const { setDisplayName, setPreferredLanguage, setHasOnboarded } = useUserStore();
  const [name, setName] = useState('');
  const [lang, setLang] = useState<typeof LANGUAGES[number]['value']>('en');

  const handleSubmit = () => {
    if (name.trim()) setDisplayName(name.trim());
    setPreferredLanguage(lang);
    setHasOnboarded(true);
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 4c-2.5 0-4 1.5-4 3.5 0 1.2.6 2.2 1.5 2.8C7.5 11.5 6 13.5 6 16c0 1 .5 2 2 2h8c1.5 0 2-1 2-2 0-2.5-1.5-4.5-3.5-5.7.9-.6 1.5-1.6 1.5-2.8C16 5.5 14.5 4 12 4z" fill="var(--olive-700)" />
          </svg>
        </div>

        <h2 className="onboarding-title">Welcome to SilverGait</h2>
        <p className="onboarding-subtitle">Your daily mobility companion</p>

        <div className="onboarding-field">
          <label htmlFor="onboard-name">What should I call you?</label>
          <input
            id="onboard-name"
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
        </div>

        <div className="onboarding-field">
          <label htmlFor="onboard-lang">Preferred language</label>
          <select
            id="onboard-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="onboarding-disclaimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--muted)" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <p>
            SilverGait is a wellness tool, not a medical device.
            Always consult your doctor for health concerns.
          </p>
        </div>

        <button className="btn-primary onboarding-btn" onClick={handleSubmit}>
          Get Started
        </button>
      </div>
    </div>
  );
}
