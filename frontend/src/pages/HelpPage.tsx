import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';
import { useT } from '../i18n';

interface FaqItem {
  question: string;
  answer: string;
}

export function HelpPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const t = useT();

  const FAQ_ITEMS: FaqItem[] = [
    { question: t.help.faqSppb, answer: t.help.faqSppbAnswer },
    { question: t.help.faqOften, answer: t.help.faqOftenAnswer },
    { question: t.help.faqSafe, answer: t.help.faqSafeAnswer },
    { question: t.help.faqVoice, answer: t.help.faqVoiceAnswer },
  ];

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.help.title}</h1>
        <p className="subtitle">{t.help.subtitle}</p>
      </div>

      <div className="stack">
        <div className="card">
          <h2>{t.help.quickHelp}</h2>
          <p>
            {t.help.quickHelpDesc}
          </p>
          <div className="stack" style={{ marginTop: 12 }}>
            <a href="tel:995" className="btn-danger" style={{ textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t.help.emergency}
            </a>
            <button className="btn-secondary" onClick={() => navigate('/caregiver')}>
              {t.help.messageCaregiver}
            </button>
            <button className="btn-secondary" onClick={() => navigate('/safety')}>
              {t.help.safetyCheck}
            </button>
          </div>
        </div>

        <div className="card">
          <h2>{t.help.voiceTips}</h2>
          <p>
            {t.help.voiceTipsDesc}
          </p>
        </div>

        <div className="card">
          <h2>{t.help.localSupport}</h2>
          <p>
            {t.help.localSupportDesc}
          </p>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="faq-section">
        <p className="card-title">{t.help.faq}</p>
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="faq-item">
            <button
              className="faq-question"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <span>{item.question}</span>
              <span className={`faq-chevron${openFaq === i ? ' open' : ''}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            <div className={`faq-answer${openFaq === i ? ' open' : ''}`}>
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="progress-actions">
        <button
          onClick={() => navigate('/caregiver')}
          className="btn-primary"
        >
          {t.help.caregiverSummary}
        </button>
        <button onClick={() => navigate('/')} className="btn-link">
          {t.help.backHome}
        </button>
      </div>
    </div>
  );
}
