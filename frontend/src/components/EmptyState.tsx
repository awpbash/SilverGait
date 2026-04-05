import { Mascot } from './Mascot';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Mascot size={72} mood="encouraging" />
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-message">{message}</p>
      {actionLabel && onAction && (
        <button className="btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
