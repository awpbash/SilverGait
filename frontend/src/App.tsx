/**
 * SilverGait - Singapore Elderly Mobility Care
 * Government-trust design with muted teal/green palette
 */

import { useState } from 'react';
import { BottomNav, VoiceAssistant } from './components';
import { HomePage } from './pages/HomePage';
import { ActivityPage } from './pages/ActivityPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { HelpPage } from './pages/HelpPage';
import { CaregiverPage } from './pages/CaregiverPage';

type PageId = 'home' | 'activity' | 'assessment' | 'exercises' | 'help' | 'caregiver';

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
    <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
  </svg>
);

const ProgressIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
  </svg>
);

const HelpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4" />
    <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const navItems = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'assessment', label: 'Check', icon: <CheckIcon /> },
  { id: 'exercises', label: 'Exercise', icon: <ExerciseIcon /> },
  { id: 'activity', label: 'Progress', icon: <ProgressIcon /> },
  { id: 'help', label: 'Help', icon: <HelpIcon /> },
];

function App() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [autoStartAssessment, setAutoStartAssessment] = useState(false);
  const [autoSelectExerciseId, setAutoSelectExerciseId] = useState<string | null>(null);

  const handleNavigate = (page: string) => {
    setActivePage(page as PageId);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;
      case 'activity':
        return <ActivityPage />;
      case 'assessment':
        return (
          <AssessmentPage
            autoStart={autoStartAssessment}
            onAutoStartConsumed={() => setAutoStartAssessment(false)}
          />
        );
      case 'exercises':
        return (
          <ExercisesPage
            autoSelectExerciseId={autoSelectExerciseId}
            onAutoSelectConsumed={() => setAutoSelectExerciseId(null)}
          />
        );
      case 'help':
        return <HelpPage onNavigate={handleNavigate} />;
      case 'caregiver':
        return <CaregiverPage onNavigate={handleNavigate} />;
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
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
      setAutoStartAssessment(Boolean(action.auto_start));
    }
    if (target === 'exercises') {
      setAutoSelectExerciseId(action.exercise_id || null);
    }
    setActivePage(target);
  };

  return (
    <div className="app-shell">
      {/* Main content area */}
      <main className="max-w-lg mx-auto screen-frame">
        {renderPage()}
      </main>

      <VoiceAssistant onAction={handleVoiceAction} />

      {/* Bottom navigation */}
      <BottomNav
        items={navItems}
        activeId={activePage}
        onSelect={(id) => setActivePage(id as PageId)}
      />
    </div>
  );
}

export default App;
