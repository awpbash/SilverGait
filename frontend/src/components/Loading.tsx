/**
 * Loading component
 * Clean, calm loading indicator
 */

interface LoadingProps {
  message?: string;
}

export function Loading({ message = 'Loading...' }: LoadingProps) {
  return (
    <div className="loading flex flex-col items-center justify-center p-8">
      <div className="spinner mb-4" />
      <p className="text-lg text-[#718096]">{message}</p>
    </div>
  );
}
