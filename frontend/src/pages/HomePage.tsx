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
  const [userName] = useState('Mr Tan'); // Demo default

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  return (
    <div className="min-h-[80vh] flex flex-col">
      <header className="px-5 pt-6 pb-4">
        <p className="subtle-text">Home Screen</p>
        <h1 className="text-2xl font-bold">
          {greeting}{userName ? `, ${userName}` : ''}
        </h1>
      </header>

      <section className="px-5">
        <div className="panel text-center">
          <button
            onClick={() => onNavigate?.('assessment')}
            className="btn-primary"
          >
            Check My Strength Today
          </button>
          <p className="subtle-text mt-2">Takes about 5 minutes</p>
        </div>
      </section>

      <section className="px-5 mt-5">
        <button
          onClick={() => onNavigate?.('help')}
          className="btn-muted"
        >
          Help & Safety
        </button>
      </section>

      <footer className="mt-auto px-5 py-5 text-center">
        <p className="text-xs text-[#8a8a8a]">
          Supported by Singapore Health Promotion Board
        </p>
      </footer>
    </div>
  );
}
