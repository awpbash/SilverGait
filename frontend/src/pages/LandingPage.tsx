/**
 * LandingPage — First screen visitors see before registering.
 * Full-screen marketing page with hero, features, and CTA.
 */

import { Mascot } from '../components/Mascot';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="landing">
      {/* Hero */}
      <div className="landing-hero">
        <div className="landing-hero-bg" />
        <div className="landing-hero-content">
          <div className="landing-logo">
            <img src="/images/sg-health.svg" alt="" className="landing-logo-icon" />
            <span className="landing-logo-text">SilverGait</span>
          </div>
          <Mascot size={96} mood="encouraging" />
          <h1 className="landing-title">Your AI Physiotherapy Companion</h1>
          <p className="landing-subtitle">
            Camera-based mobility assessment and personalised exercise plans for Singapore's seniors. No wearables needed.
          </p>
          <button className="landing-cta" onClick={onGetStarted}>
            Get Started
          </button>
          <p className="landing-free">Free to use. No account required.</p>
        </div>
      </div>

      {/* Features */}
      <div className="landing-features">
        <div className="landing-feature">
          <div className="landing-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
          <h3>Video Mobility Check</h3>
          <p>SPPB assessment using your phone camera with real-time pose detection</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 10h3V8h2v8H7v-2H4v2H2V8h2v2zm18 0v6h-2v-2h-3v2h-2V8h2v2h3V8h2v2zM9 11h6v2H9v-2z" />
            </svg>
          </div>
          <h3>Personalised Exercises</h3>
          <p>AI-generated exercise plans adapted to your frailty tier and deficits</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3>AI Wellness Chat</h3>
          <p>Multilingual companion (EN, ZH, MS, TA) with Singlish-aware voice support</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h3>Progress Tracking</h3>
          <p>Track SPPB scores over time with caregiver dashboard and safety alerts</p>
        </div>
      </div>

      {/* Trust bar */}
      <div className="landing-trust">
        <p>Built for Singapore's ageing population</p>
        <div className="landing-trust-items">
          <span>SPPB Clinical Protocol</span>
          <span>4 Languages</span>
          <span>Safety Guardrails</span>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="landing-bottom">
        <button className="landing-cta" onClick={onGetStarted}>
          Start Your First Check
        </button>
      </div>
    </div>
  );
}
