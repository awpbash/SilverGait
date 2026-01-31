/**
 * Home Page - Singapore Elderly Mobility Care
 * Design Constitution: One primary action per screen, elderly-first
 */

import { useState, useEffect } from 'react';

interface HomePageProps {
  onNavigate?: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const [greeting, setGreeting] = useState('');
  const [userName] = useState(''); // Could be personalized with user store

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header - Government branding */}
      <header className="py-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          {/* Teal health icon */}
          <div className="w-12 h-12 rounded-full bg-[#0d7377] flex items-center justify-center">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-[#1a202c]">SilverPhysio</h1>
            <p className="text-sm text-[#718096]">Health Check</p>
          </div>
        </div>
      </header>

      {/* Greeting */}
      <section className="text-center mb-8">
        <p className="text-2xl font-semibold text-[#1a202c]">
          {greeting}{userName ? `, ${userName}` : ''}
        </p>
      </section>

      {/* Primary Action - ONE clear action */}
      <section className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Illustration */}
        <div className="mb-8">
          <div className="w-40 h-40 mx-auto relative">
            {/* Simple elderly person illustration */}
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {/* Chair */}
              <rect x="45" y="120" width="110" height="10" rx="2" fill="#0d7377" opacity="0.3"/>
              <rect x="50" y="130" width="10" height="50" rx="2" fill="#0d7377" opacity="0.3"/>
              <rect x="140" y="130" width="10" height="50" rx="2" fill="#0d7377" opacity="0.3"/>
              {/* Person sitting */}
              <circle cx="100" cy="60" r="25" fill="#0d7377" opacity="0.6"/>
              <ellipse cx="100" cy="105" rx="30" ry="25" fill="#0d7377" opacity="0.5"/>
              {/* Arms */}
              <rect x="60" y="90" width="25" height="8" rx="4" fill="#0d7377" opacity="0.4"/>
              <rect x="115" y="90" width="25" height="8" rx="4" fill="#0d7377" opacity="0.4"/>
            </svg>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => onNavigate?.('assessment')}
          className="btn-primary gap-3 mb-4"
        >
          Check My Strength Today
        </button>

        <p className="text-[#718096] text-center">
          Takes about 5 minutes
        </p>
      </section>

      {/* Secondary options - minimal, below fold */}
      <section className="mt-auto pt-8 pb-4 space-y-3">
        <button
          onClick={() => onNavigate?.('exercises')}
          className="btn-secondary"
        >
          <span className="mr-2">Show Me Exercises</span>
        </button>

        <button
          onClick={() => onNavigate?.('activity')}
          className="btn-secondary"
        >
          <span className="mr-2">View My Progress</span>
        </button>
      </section>

      {/* Footer - Trust indicators */}
      <footer className="py-4 text-center">
        <p className="text-xs text-[#a0aec0]">
          Supported by Singapore Health Promotion Board
        </p>
      </footer>
    </div>
  );
}
