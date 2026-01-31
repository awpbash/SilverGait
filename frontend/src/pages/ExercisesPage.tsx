/**
 * Exercises Page - Simple Exercises
 * Design Constitution: One action per screen, no jargon, no emojis
 */

import { useState } from 'react';

interface Exercise {
  id: string;
  title: string;
  description: string;
  duration: string;
  steps: string[];
  safety: string;
}

const EXERCISES: Exercise[] = [
  {
    id: 'chair-stand',
    title: 'Chair Stand',
    description: 'Strengthen your legs for better balance',
    duration: '5 minutes',
    steps: [
      'Sit in a sturdy chair with your feet flat on floor',
      'Cross your arms over your chest',
      'Stand up slowly without using your hands',
      'Sit back down slowly with control',
      'Repeat 5-10 times',
    ],
    safety: 'Use a chair with armrests if needed. Go slowly.',
  },
  {
    id: 'wall-push',
    title: 'Wall Push-Up',
    description: 'Build arm strength safely',
    duration: '3 minutes',
    steps: [
      'Stand facing a wall, about arm\'s length away',
      'Place your palms flat on the wall at shoulder height',
      'Slowly bend your elbows and lean towards the wall',
      'Push back to starting position',
      'Repeat 10 times',
    ],
    safety: 'Keep your back straight. Breathe normally.',
  },
  {
    id: 'heel-raise',
    title: 'Heel Raises',
    description: 'Improve balance and calf strength',
    duration: '3 minutes',
    steps: [
      'Stand behind a chair and hold the back for support',
      'Rise up on your toes slowly',
      'Hold for 2 seconds',
      'Lower your heels slowly',
      'Repeat 10-15 times',
    ],
    safety: 'Keep holding the chair if needed.',
  },
  {
    id: 'marching',
    title: 'Marching in Place',
    description: 'Good warm-up for daily movement',
    duration: '3 minutes',
    steps: [
      'Stand near a wall or chair for support if needed',
      'Lift your right knee up towards your chest',
      'Lower it and lift your left knee',
      'Continue alternating like marching',
      'Do for 1-2 minutes',
    ],
    safety: 'Start slowly. Stop if you feel dizzy.',
  },
];

export function ExercisesPage() {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  // Exercise detail view
  if (selectedExercise) {
    return (
      <div className="min-h-[80vh] flex flex-col">
        {/* Back button */}
        <header className="py-4">
          <button
            onClick={() => setSelectedExercise(null)}
            className="flex items-center gap-2 text-[#0d7377] font-medium px-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Back
          </button>
        </header>

        {/* Exercise title */}
        <div className="px-4 mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#1a202c]">{selectedExercise.title}</h1>
          <p className="text-[#718096] mt-1">{selectedExercise.duration}</p>
        </div>

        {/* Steps */}
        <div className="flex-1 px-4">
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-[#1a202c] mb-4">How to do it:</h2>
            <ol className="space-y-4">
              {selectedExercise.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="w-8 h-8 bg-[#0d7377] text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[#4a5568] pt-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Safety note */}
          <div className="card bg-[#fdf8e8] border border-[#f6e05e]">
            <p className="font-semibold text-[#c9a227] mb-1">Safety</p>
            <p className="text-[#4a5568]">{selectedExercise.safety}</p>
          </div>
        </div>

        {/* Done button */}
        <div className="p-4">
          <button
            onClick={() => setSelectedExercise(null)}
            className="btn-primary"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Exercise list view
  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <header className="py-6 text-center">
        <h1 className="text-2xl font-bold text-[#1a202c]">Simple Exercises</h1>
        <p className="text-[#718096] mt-1">Gentle movements to keep you strong</p>
      </header>

      {/* Safety reminder */}
      <div className="mx-4 mb-6">
        <div className="card bg-[#fdf8e8] border border-[#f6e05e]">
          <p className="text-[#c9a227] font-medium text-center">
            Always have a chair or wall nearby for support
          </p>
        </div>
      </div>

      {/* Exercise list */}
      <div className="flex-1 px-4 space-y-3">
        {EXERCISES.map((exercise) => (
          <button
            key={exercise.id}
            onClick={() => setSelectedExercise(exercise)}
            className="w-full card flex items-center gap-4 text-left active:bg-[#f7fafc]"
          >
            {/* Exercise icon placeholder */}
            <div className="w-14 h-14 rounded-xl bg-[#e8f5ef] flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-[#0d7377]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#1a202c]">{exercise.title}</h3>
              <p className="text-[#718096] text-sm">{exercise.description}</p>
              <p className="text-[#0d7377] text-sm mt-1">{exercise.duration}</p>
            </div>
            <svg className="w-6 h-6 text-[#cbd5e0]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
