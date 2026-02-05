interface HelpPageProps {
  onNavigate?: (page: string) => void;
}

export function HelpPage({ onNavigate }: HelpPageProps) {
  return (
    <div className="min-h-[80vh] flex flex-col">
      <header className="px-5 pt-6 pb-4 text-center">
        <p className="subtle-text">Help & Safety</p>
        <h1 className="text-2xl font-bold text-[#1a202c] mt-1">Need Help?</h1>
        <p className="subtle-text mt-1">We are here to keep you safe</p>
      </header>

      <div className="px-5 space-y-4 flex-1">
        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Quick Help</h2>
          <p className="text-[#4a4a4a]">
            If you feel dizzy or unsteady, sit down and rest. Ask a family member to stay nearby.
          </p>
          <div className="mt-3 space-y-2">
            <button className="btn-secondary">Call 995 (Emergency)</button>
            <button className="btn-secondary">Message Caregiver</button>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Voice Tips</h2>
          <p className="text-[#4a4a4a]">
            Press Voice Chat and say: "Start check", "Show exercises", or "Go home".
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-[#1a202c] mb-2">Local Support</h2>
          <p className="text-[#4a4a4a]">
            You can visit nearby Active Ageing Centres for guided exercises and support.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <button
          onClick={() => onNavigate?.('caregiver')}
          className="btn-primary"
        >
          Caregiver Summary
        </button>
        <button onClick={() => onNavigate?.('home')} className="btn-secondary">
          Back to Home
        </button>
      </div>
    </div>
  );
}
