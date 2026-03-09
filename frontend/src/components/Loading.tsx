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
    <div className="loading flex flex-col items-center justify-center p-8">
      <div className="spinner mb-4" />
      <p className="text-lg text-[#718096]">{displayMessage}</p>
    </div>
  );
}
