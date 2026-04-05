/**
 * Loading component
 * Clean, calm loading indicator
 */

import { useT } from '../i18n';

interface LoadingProps {
  message?: string;
}

export function Loading({ message }: LoadingProps) {
  const t = useT();
  const displayMessage = message ?? t.common.loading;
  return (
    <div className="loading">
      <div className="spinner" />
      <p className="loading-text">{displayMessage}</p>
    </div>
  );
}
