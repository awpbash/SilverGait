import { useNavigate } from 'react-router-dom';

export function VoiceAssistant() {
  const navigate = useNavigate();

  return (
    <div className="voice-assistant">
      <button
        type="button"
        className="voice-fab"
        onClick={() => navigate('/?mic=1')}
        aria-label="Open voice chat"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M19 11a7 7 0 0 1-14 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
    </div>
  );
}
