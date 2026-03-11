/**
 * SilverGait - Singapore Elderly Mobility Care
 * Warm, calm palette aligned with Figma mockups
 */

import { useMemo, lazy, Suspense } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, VoiceAssistant, OnboardingModal, Loading } from './components';
import { useUiStore, useUserStore } from './stores';
import { useT } from './i18n';
import { HomePage } from './pages/HomePage';
import { ActivityPage } from './pages/ActivityPage';
import { HelpPage } from './pages/HelpPage';
import { CaregiverPage } from './pages/CaregiverPage';
import { SafetyPage } from './pages/SafetyPage';
import { CommunityPage } from './pages/CommunityPage';
import { ReportPage } from './pages/ReportPage';
import { MorePage } from './pages/MorePage';
import { VoiceSettingsPage } from './pages/VoiceSettingsPage';
import { WearablesPage } from './pages/WearablesPage';
import { SleepPage } from './pages/SleepPage';

// Lazy-load heavy routes (TF.js + pose detection)
const AssessmentPage = lazy(() => import('./pages/AssessmentPage').then(m => ({ default: m.AssessmentPage })));
const ExercisesPage = lazy(() => import('./pages/ExercisesPage').then(m => ({ default: m.ExercisesPage })));

type PageId = 'home' | 'activity' | 'assessment' | 'exercises' | 'help' | 'caregiver' | 'safety' | 'community' | 'report' | 'more' | 'voiceSettings' | 'wearables' | 'sleep';

const ROUTES: Record<PageId, string> = {
  home: '/',
  assessment: '/check',
  exercises: '/exercises',
  activity: '/progress',
  more: '/more',
  help: '/help',
  caregiver: '/caregiver',
  safety: '/safety',
  community: '/community',
  report: '/report',
  voiceSettings: '/voice-settings',
  wearables: '/wearables',
  sleep: '/sleep',
};


// Icon components
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const ExerciseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 10h3V8h2v8H7v-2H4v2H2V8h2v2zm18 0v6h-2v-2h-3v2h-2V8h2v2h3V8h2v2zM9 11h6v2H9v-2z" />
  </svg>
);

const ProgressIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path d="M12 20s-6-4.35-8.5-7.5C1.4 9.4 3.1 6 6.5 6c2 0 3.5 1.1 4.5 2.6C12 7.1 13.5 6 15.5 6c3.4 0 5.1 3.4 3 6.5C18 15.65 12 20 12 20z" />
  </svg>
);

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="12" cy="12" r="2.5" />
    <circle cx="19" cy="12" r="2.5" />
  </svg>
);

function App() {
  const { viewMode, setViewMode } = useUiStore();
  const { hasOnboarded } = useUserStore();
  const t = useT();

  const navItems = useMemo(() => [
    { id: 'home', label: t.nav.home, icon: <HomeIcon /> },
    { id: 'assessment', label: t.nav.check, icon: <CheckIcon /> },
    { id: 'exercises', label: t.nav.exercise, icon: <ExerciseIcon /> },
    { id: 'activity', label: t.nav.progress, icon: <ProgressIcon /> },
    { id: 'more', label: t.nav.more, icon: <MoreIcon /> },
  ], [t]);
  const location = useLocation();
  const navigate = useNavigate();

  const activeId = useMemo<PageId | ''>(() => {
    const path = location.pathname;
    if (path === ROUTES.home) return 'home';
    if (path.startsWith(ROUTES.assessment)) return 'assessment';
    if (path.startsWith(ROUTES.exercises)) return 'exercises';
    if (path.startsWith(ROUTES.activity)) return 'activity';
    // Pages accessible via "More" highlight the More tab
    if (path.startsWith(ROUTES.more)) return 'more';
    if (path.startsWith(ROUTES.help)) return 'more';
    if (path.startsWith(ROUTES.caregiver)) return 'more';
    if (path.startsWith(ROUTES.safety)) return 'more';
    if (path.startsWith(ROUTES.community)) return 'more';
    if (path.startsWith(ROUTES.report)) return 'more';
    if (path.startsWith(ROUTES.voiceSettings)) return 'more';
    if (path.startsWith(ROUTES.wearables)) return 'more';
    if (path.startsWith(ROUTES.sleep)) return 'more';
    return '';
  }, [location.pathname]);

  const handleNavigate = (page: PageId) => {
    navigate(ROUTES[page]);
  };

  return (
    <div className="app-shell" data-view={viewMode}>
      {!hasOnboarded && <OnboardingModal />}

      {/* External toolbar — outside the phone frame */}
      <div className="device-toolbar">
        <div className="device-toolbar-brand">
          <img src="/images/sg-health.svg" alt="SilverGait" className="device-toolbar-icon" />
          <span>SilverGait</span>
        </div>

        <div className="device-toolbar-controls">
          <div className="view-toggle" role="group" aria-label="View mode">
            <button type="button" className={viewMode === 'mobile' ? 'active' : ''} onClick={() => setViewMode('mobile')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="2" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="18" r="1" /></svg>
              {t.header.mobile}
            </button>
            <button type="button" className={viewMode === 'desktop' ? 'active' : ''} onClick={() => setViewMode('desktop')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="4" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              {t.header.desktop}
            </button>
          </div>
        </div>
      </div>

      {/* Phone frame */}
      <div className="phone-bezel">
        {/* Notch */}
        <div className="phone-notch">
          <div className="phone-notch-cam" />
        </div>

        {/* Screen content */}
        <main className="screen-frame">
          <div className="screen-scroll">
            <Suspense fallback={<Loading message="Loading..." />}>
              <Routes>
                <Route path={ROUTES.home} element={<HomePage />} />
                <Route path={ROUTES.assessment} element={<AssessmentPage />} />
                <Route path={ROUTES.exercises} element={<ExercisesPage />} />
                <Route path={ROUTES.activity} element={<ActivityPage />} />
                <Route path={ROUTES.help} element={<HelpPage />} />
                <Route path={ROUTES.caregiver} element={<CaregiverPage />} />
                <Route path={ROUTES.safety} element={<SafetyPage />} />
                <Route path={ROUTES.community} element={<CommunityPage />} />
                <Route path={ROUTES.report} element={<ReportPage />} />
                <Route path={ROUTES.more} element={<MorePage />} />
                <Route path={ROUTES.voiceSettings} element={<VoiceSettingsPage />} />
                <Route path={ROUTES.wearables} element={<WearablesPage />} />
                <Route path={ROUTES.sleep} element={<SleepPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
            </Suspense>
          </div>

          {/* Voice FAB — navigates to home chat */}
          {activeId !== 'home' && <VoiceAssistant />}

          {/* Bottom navigation */}
          <BottomNav
            items={navItems}
            activeId={activeId}
            onSelect={(id) => handleNavigate(id as PageId)}
          />
        </main>

        {/* Home indicator bar */}
        <div className="phone-home-indicator" />
      </div>
    </div>
  );
}

export default App;
