/**
 * Error message component
 * Shows helpful "Check Internet" messages as per CLAUDE.md
 */

import { useT } from '../i18n';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const t = useT();
  return (
    <div className="card error-card">
      <p className="error-card-text">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-primary"
          aria-label="Try again"
        >
          {t.common.tryAgain}
        </button>
      )}
    </div>
  );
}
