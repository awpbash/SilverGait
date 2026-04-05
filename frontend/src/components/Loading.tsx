/**
 * Loading component
 * Clean, calm loading indicator with skeleton variants
 */

import { useT } from '../i18n';

interface LoadingProps {
  message?: string;
  variant?: 'spinner' | 'chat' | 'card' | 'page';
}

export function Loading({ message, variant = 'spinner' }: LoadingProps) {
  const t = useT();

  if (variant === 'chat') {
    return (
      <div className="skeleton-container">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-chat-row" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="skeleton-avatar shimmer" />
            <div className="skeleton-lines">
              <div className="skeleton-line shimmer" style={{ width: '75%' }} />
              <div className="skeleton-line shimmer" style={{ width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="skeleton-container">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton-card shimmer" style={{ animationDelay: `${i * 0.15}s` }}>
            <div className="skeleton-line shimmer" style={{ width: '60%', height: '14px' }} />
            <div className="skeleton-line shimmer" style={{ width: '90%' }} />
            <div className="skeleton-line shimmer" style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div className="skeleton-container skeleton-page">
        <div className="skeleton-line shimmer" style={{ width: '40%', height: '20px', marginBottom: '16px' }} />
        {[0, 1].map((i) => (
          <div key={i} className="skeleton-card shimmer" style={{ animationDelay: `${i * 0.15}s` }}>
            <div className="skeleton-line shimmer" style={{ width: '55%', height: '14px' }} />
            <div className="skeleton-line shimmer" style={{ width: '80%' }} />
            <div className="skeleton-line shimmer" style={{ width: '35%' }} />
          </div>
        ))}
      </div>
    );
  }

  const displayMessage = message ?? t.common.loading;
  return (
    <div className="loading">
      <div className="spinner" />
      <p className="loading-text">{displayMessage}</p>
    </div>
  );
}
