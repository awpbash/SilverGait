/**
 * Activity Page - Your Progress
 * Design Constitution: Simple, encouraging, no jargon
 */

import { useState } from 'react';
import { useUserStore } from '../stores';

const DEMO_WEEK_DATA = [
  { day: 'Mon', steps: 3200 },
  { day: 'Tue', steps: 4500 },
  { day: 'Wed', steps: 2800 },
  { day: 'Thu', steps: 5100 },
  { day: 'Fri', steps: 3800 },
  { day: 'Sat', steps: 4200 },
  { day: 'Sun', steps: 3500 },
];

export function ActivityPage() {
  const { todayMetrics } = useUserStore();
  const [selectedDay, setSelectedDay] = useState(6);

  const todaySteps = todayMetrics?.steps || DEMO_WEEK_DATA[6].steps;
  const goalSteps = 5000;
  const progress = Math.min(100, (todaySteps / goalSteps) * 100);

  const weekTotal = DEMO_WEEK_DATA.reduce((sum, d) => sum + d.steps, 0);

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 text-center">
        <p className="subtle-text">Progress Screen</p>
        <h1 className="text-2xl font-bold text-[#1a202c] mt-1">Your Progress</h1>
        <p className="subtle-text mt-1">Keep moving every day</p>
      </header>

      {/* Today's Steps - Primary focus */}
      <section className="mx-5 mb-6">
        <div className="panel bg-[#5e8e3e] text-white py-8">
          <div className="text-center">
            <p className="text-white/80 text-lg mb-2">Today's Steps</p>
            <p className="text-5xl font-bold mb-4">
              {todaySteps.toLocaleString()}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-white/25 rounded-full h-3 mb-2">
              <div
                className="bg-white h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-white/80">Goal: {goalSteps.toLocaleString()} steps</p>
          </div>
        </div>
      </section>

      {/* Weekly view */}
      <section className="mx-5 mb-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-4">This Week</h2>

          {/* Day buttons */}
          <div className="flex justify-between mb-4">
            {DEMO_WEEK_DATA.map((day, i) => (
              <button
                key={day.day}
                onClick={() => setSelectedDay(i)}
                className={`flex flex-col items-center p-2 rounded-lg min-w-[40px] ${
                  selectedDay === i
                    ? 'bg-[#edf4e6] text-[#5e8e3e]'
                    : 'text-[#6a6a6a]'
                }`}
              >
                <span className="text-sm font-medium">{day.day}</span>
                <div
                  className={`w-2 h-2 rounded-full mt-1 ${
                    day.steps >= 4000
                      ? 'bg-[#5e8e3e]'
                      : day.steps >= 2500
                      ? 'bg-[#b3872e]'
                      : 'bg-[#d7d6cf]'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Selected day */}
          <div className="text-center p-4 bg-[#f3f2ec] rounded-xl">
            <p className="text-3xl font-bold text-[#5e8e3e]">
              {DEMO_WEEK_DATA[selectedDay].steps.toLocaleString()}
            </p>
            <p className="text-[#6a6a6a]">steps on {DEMO_WEEK_DATA[selectedDay].day}</p>
          </div>
        </div>
      </section>

      {/* Encouragement */}
      <section className="mx-5 flex-1">
        <div className="card bg-[#edf4e6] border border-[#b8d7a3]">
          <div className="text-center">
            {/* Success indicator */}
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#5e8e3e] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-[#5e8e3e]">
              {progress >= 100
                ? 'Goal reached! Well done!'
                : progress >= 50
                ? "You're doing great!"
                : 'Every step counts!'}
            </p>
            <p className="text-[#4a4a4a] mt-2">
              This week: {weekTotal.toLocaleString()} steps total
            </p>
          </div>
        </div>
      </section>

      {/* Simple tips */}
      <section className="mx-5 py-6">
        <p className="text-center text-[#6a6a6a]">
          Try a short walk after each meal
        </p>
      </section>
    </div>
  );
}
