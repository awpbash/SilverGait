import { useAssessmentStore } from '../stores';

interface CaregiverPageProps {
  onNavigate?: (page: string) => void;
}

export function CaregiverPage({ onNavigate }: CaregiverPageProps) {
  const { latestAssessment } = useAssessmentStore();

  const scoreText = latestAssessment ? `${latestAssessment.score}/4` : 'No data yet';
  const confidenceText = latestAssessment ? `${Math.round(latestAssessment.confidence * 100)}%` : '--';
  const topRecommendations = latestAssessment?.recommendations?.slice(0, 2) || [
    'Encourage short daily walks',
    'Practice chair stands with support',
  ];

  return (
    <div className="min-h-[80vh] flex flex-col">
      <header className="px-5 pt-6 pb-4 text-center">
        <p className="subtle-text">Caregiver View</p>
        <h1 className="text-2xl font-bold text-[#1a202c] mt-1">Caregiver Summary</h1>
        <p className="subtle-text mt-1">Simple snapshot for family members</p>
      </header>

      <div className="px-5 space-y-4 flex-1">
        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Latest Check</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#f6f5f0] rounded-xl text-center">
              <p className="text-2xl font-bold text-[#5e8e3e]">{scoreText}</p>
              <p className="text-sm text-[#6a6a6a]">Mobility Score</p>
            </div>
            <div className="p-3 bg-[#f6f5f0] rounded-xl text-center">
              <p className="text-2xl font-bold text-[#5e8e3e]">{confidenceText}</p>
              <p className="text-sm text-[#6a6a6a]">Confidence</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Suggested Focus</h2>
          <ul className="space-y-2">
            {topRecommendations.map((item, index) => (
              <li key={item} className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-[#5e8e3e] text-white flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </span>
                <span className="text-[#4a4a4a]">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Care Notes</h2>
          <p className="text-[#4a4a4a]">
            Encourage hydration, clear walkways, and daily gentle movement.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <button className="btn-primary">Share Summary</button>
        <button onClick={() => onNavigate?.('help')} className="btn-secondary">
          Back to Help
        </button>
      </div>
    </div>
  );
}
