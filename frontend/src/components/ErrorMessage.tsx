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
    <div className="card bg-red-50 border-red-200 text-center">
      <p className="text-lg text-red-800 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-primary"
          aria-label="Try again"
        >
          {t.common.tryAgain}
        </button>
      )}
    </div>
  );
}
