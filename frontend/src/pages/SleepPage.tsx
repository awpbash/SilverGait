import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';
import { Markdown } from '../components/Markdown';
import { useT } from '../i18n';
import { useUserStore } from '../stores';
import { contextApi, chatApi, carePlanApi } from '../services/api';

interface SleepContext {
  sleep_risk: string;
  mood_risk: string;
  exercise_streak: number;
  current_tier: string | null;
  display_name: string;
}

export function SleepPage() {
  const t = useT();
  const st = (t as any).sleep || {};
  const navigate = useNavigate();
  const { userId } = useUserStore();
  const lang = useUserStore((s: { preferredLanguage: string }) => s.preferredLanguage);

  const [ctx, setCtx] = useState<SleepContext | null>(null);
  const [sleepPlan, setSleepPlan] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);

  // Fetch user context + active sleep care plan
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ctxData, plans] = await Promise.all([
          contextApi.get(userId),
          carePlanApi.getActive(userId),
        ]);
        if (cancelled) return;
        setCtx({
          sleep_risk: ctxData.sleep_risk,
          mood_risk: ctxData.mood_risk,
          exercise_streak: ctxData.exercise_streak,
          current_tier: ctxData.current_tier,
          display_name: ctxData.display_name,
        });
        const sleep = plans.find(p => p.plan_type === 'sleep');
        if (sleep) setSleepPlan(sleep.content);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Get personalized advice from the Sleep Agent via chat
  const getAdvice = useCallback(async () => {
    setAdviceLoading(true);
    setAdvice('');
    try {
      const langMap: Record<string, string> = { en: 'en', mandarin: 'zh', malay: 'ms', tamil: 'ta' };
      let text = '';
      await chatApi.sendStream(
        userId,
        st.advicePrompt || 'I need help with my sleep. Can you give me a personalized sleep plan with specific steps I can start tonight?',
        (chunk) => {
          text += chunk;
          setAdvice(text);
        },
        langMap[lang] || 'en',
      );
    } catch {
      setAdvice(st.adviceFailed || 'Could not get sleep advice right now. Try again later.');
    } finally {
      setAdviceLoading(false);
    }
  }, [userId, lang, st]);

  const riskColor = (risk: string) => {
    if (risk === 'high') return 'var(--red, #e8475f)';
    if (risk === 'moderate') return 'var(--amber, #ff9f0a)';
    return 'var(--green, #30d158)';
  };

  const riskLabel = (risk: string) => {
    if (risk === 'high') return st.riskHigh || 'High';
    if (risk === 'moderate') return st.riskModerate || 'Moderate';
    return st.riskLow || 'Low';
  };

  return (
    <div className="page sleep-page">
      <AppHeader />

      <div className="page-title">
        <h1>{st.title || 'Sleep & Wellness'}</h1>
        <p className="sleep-subtitle">{st.subtitle || 'Personalized sleep advice for better rest'}</p>
      </div>

      {loading ? (
        <div className="sleep-loading">
          <div className="sleep-spinner" />
          <p>{t.common.loading}</p>
        </div>
      ) : (
        <>
          {/* Risk cards */}
          {ctx && (
            <div className="sleep-risk-cards">
              <div className="sleep-risk-card" style={{ '--risk-color': riskColor(ctx.sleep_risk) } as React.CSSProperties}>
                <div className="sleep-risk-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </div>
                <div className="sleep-risk-info">
                  <span className="sleep-risk-label">{st.sleepRisk || 'Sleep Risk'}</span>
                  <strong style={{ color: riskColor(ctx.sleep_risk) }}>{riskLabel(ctx.sleep_risk)}</strong>
                </div>
              </div>

              <div className="sleep-risk-card" style={{ '--risk-color': riskColor(ctx.mood_risk) } as React.CSSProperties}>
                <div className="sleep-risk-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </div>
                <div className="sleep-risk-info">
                  <span className="sleep-risk-label">{st.moodRisk || 'Mood'}</span>
                  <strong style={{ color: riskColor(ctx.mood_risk) }}>{riskLabel(ctx.mood_risk)}</strong>
                </div>
              </div>

              {ctx.exercise_streak > 0 && (
                <div className="sleep-streak-badge">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 23c-4.97 0-8-3.03-8-7 0-2.45.85-4.17 2-5.5.6-.7 1.3-1.2 1.95-1.65.15-.1.3.1.2.25-.5.75-.65 1.65-.15 2.65.1.2.35.2.4-.02.4-1.6 1.6-3.4 3.6-4.73 2-1.35 2.8-3.1 2.8-3.1s.5 1.6.5 3.6c0 1.1-.35 2.1-.85 2.85-.1.15.08.32.22.22.75-.5 1.63-1.45 2.08-2.57.1-.25.45-.2.45.07 0 2-.6 3.55-1.2 4.53-.5.8-.45 1.8.2 2.45.1.1.25.05.28-.08.15-.65.1-1.4-.2-2.1-.05-.12.1-.22.2-.15C18.25 13.2 20 15.15 20 17c0 3.55-3.03 6-8 6z" fill="#ff9f0a" />
                  </svg>
                  <span>{ctx.exercise_streak}{st.dayStreak || '-day streak'}</span>
                </div>
              )}
            </div>
          )}

          {/* Active sleep plan from care plans */}
          {sleepPlan && (
            <div className="sleep-plan-card">
              <h2>{st.yourPlan || 'Your Sleep Plan'}</h2>
              <div className="sleep-plan-content"><Markdown text={sleepPlan} /></div>
            </div>
          )}

          {/* Get personalized advice button */}
          <div className="sleep-advice-section">
            <button
              className="sleep-advice-btn"
              onClick={getAdvice}
              disabled={adviceLoading}
            >
              {adviceLoading ? (
                <>
                  <div className="sleep-spinner small" />
                  {st.gettingAdvice || 'Getting your advice...'}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {st.getAdvice || 'Get Personalized Sleep Advice'}
                </>
              )}
            </button>

            {advice && (
              <div className="sleep-advice-result">
                <div className="sleep-advice-text"><Markdown text={advice} /></div>
              </div>
            )}
          </div>

          {/* Quick tips */}
          <div className="sleep-tips">
            <h2>{st.quickTips || 'Quick Tips'}</h2>
            <div className="sleep-tips-list">
              {[
                { icon: '🌙', text: st.tip1 || 'Keep a consistent bedtime — same time every night' },
                { icon: '☕', text: st.tip2 || 'No kopi or teh after 2pm' },
                { icon: '📱', text: st.tip3 || 'Put away screens 1 hour before bed' },
                { icon: '🌡️', text: st.tip4 || 'Keep your room cool — fan or AC at 24-25°C' },
                { icon: '🚶', text: st.tip5 || 'Light exercise during the day helps you sleep better' },
              ].map((tip, i) => (
                <div key={i} className="sleep-tip-item">
                  <span className="sleep-tip-icon">{tip.icon}</span>
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat link */}
          <button
            className="sleep-chat-link"
            onClick={() => navigate('/')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {st.chatMore || 'Chat for more sleep & wellness advice'}
          </button>
        </>
      )}
    </div>
  );
}
