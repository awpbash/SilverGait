/**
 * SilverGait - Singapore Elderly Mobility Care
 * Warm, calm palette aligned with Figma mockups
 */

import { useMemo } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, VoiceAssistant } from './components';
import { useUiStore } from './stores';
import { HomePage } from './pages/HomePage';
import { ActivityPage } from './pages/ActivityPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { HelpPage } from './pages/HelpPage';
import { CaregiverPage } from './pages/CaregiverPage';
import { SafetyPage } from './pages/SafetyPage';
import { CommunityPage } from './pages/CommunityPage';
import { ReportPage } from './pages/ReportPage';

type PageId = 'home' | 'activity' | 'assessment' | 'exercises' | 'help' | 'caregiver' | 'safety' | 'community' | 'report';

const ROUTES: Record<PageId, string> = {
  home: '/',
  assessment: '/check',
  exercises: '/exercises',
  activity: '/progress',
  help: '/help',
  caregiver: '/caregiver',
  safety: '/safety',
  community: '/community',
  report: '/report',
};

// Icon components - simple, clear
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

const navItems = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'assessment', label: 'Check', icon: <CheckIcon /> },
  { id: 'exercises', label: 'Exercise', icon: <ExerciseIcon /> },
  { id: 'activity', label: 'Progress', icon: <ProgressIcon /> },
];

function App() {
  const { viewMode } = useUiStore();
  const location = useLocation();
  const navigate = useNavigate();

  const activeId = useMemo<PageId | ''>(() => {
    const path = location.pathname;
    if (path === ROUTES.home) return 'home';
    if (path.startsWith(ROUTES.assessment)) return 'assessment';
    if (path.startsWith(ROUTES.exercises)) return 'exercises';
    if (path.startsWith(ROUTES.activity)) return 'activity';
    if (path.startsWith(ROUTES.help)) return '';
    if (path.startsWith(ROUTES.caregiver)) return '';
    return '';
  }, [location.pathname]);

  const handleNavigate = (page: PageId) => {
    navigate(ROUTES[page]);
  };

  const handleVoiceAction = (action: {
    type?: string;
    target?: string | null;
    exercise_id?: string | null;
    auto_start?: boolean | null;
  }) => {
    if (action?.type !== 'navigate' || !action.target) {
      return;
    }

    const target = action.target as PageId;
    if (target === 'assessment') {
      const params = new URLSearchParams();
      if (action.auto_start) {
        params.set('start', '1');
        params.set('mode', 'comprehensive');
      }
      const search = params.toString();
      navigate(`${ROUTES.assessment}${search ? `?${search}` : ''}`);
      return;
    }
    if (target === 'exercises') {
      const params = new URLSearchParams();
      if (action.exercise_id) {
        params.set('exercise', action.exercise_id);
      }
      const search = params.toString();
      navigate(`${ROUTES.exercises}${search ? `?${search}` : ''}`);
      return;
    }
    navigate(ROUTES[target]);
  };

  return (
    <div className="app-shell" data-view={viewMode}>
      {/* Main content area */}
      <main className="screen-frame">
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
          <Route path="*" element={<HomePage />} />
        </Routes>

        {/* Bottom navigation */}
        <BottomNav
          items={navItems}
          activeId={activeId}
          onSelect={(id) => handleNavigate(id as PageId)}
        />
      </main>

      <VoiceAssistant onAction={handleVoiceAction} />
    </div>
  );
}

export default App;
