import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is an SPPB assessment?',
    answer: 'The Short Physical Performance Battery (SPPB) is a simple test that measures your balance, walking speed, and ability to stand from a chair. It helps track your mobility over time.',
  },
  {
    question: 'How often should I do the check?',
    answer: 'We recommend doing a full assessment once a week. Daily exercises are encouraged to maintain and improve your mobility.',
  },
  {
    question: 'Is it safe to do exercises alone?',
    answer: 'The exercises are designed to be safe, but always have a sturdy chair or wall nearby for support. If you feel pain or dizziness, stop immediately and rest.',
  },
  {
    question: 'How does the voice assistant work?',
    answer: 'Press the voice button and say commands like "Start check", "Show exercises", or "Go home". It understands English and Singlish.',
  },
];

export function HelpPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>Need Help?</h1>
        <p className="subtitle">We are here to keep you safe</p>
      </div>

      <div className="stack">
        <div className="card">
          <h2>Quick Help</h2>
          <p>
            If you feel dizzy or unsteady, sit down and rest. Ask a family member to stay nearby.
          </p>
          <div className="stack" style={{ marginTop: 12 }}>
            <a href="tel:995" className="btn-danger" style={{ textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Call 995 (Emergency)
            </a>
            <button className="btn-secondary" onClick={() => navigate('/caregiver')}>
              Message Caregiver
            </button>
            <button className="btn-secondary" onClick={() => navigate('/safety')}>
              Home Safety Check
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Voice Tips</h2>
          <p>
            Press the Voice Assistant button and say: &quot;Start check&quot;, &quot;Show exercises&quot;, or &quot;Go home&quot;.
          </p>
        </div>

        <div className="card">
          <h2>Local Support</h2>
          <p>
            Visit nearby Active Ageing Centres for guided exercises and community support.
          </p>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="faq-section">
        <p className="card-title">Frequently Asked Questions</p>
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
          Caregiver Summary
        </button>
        <button onClick={() => navigate('/')} className="btn-link">
          Back to Home
        </button>
      </div>
    </div>
  );
}
