import { useToastStore } from '../stores/toastStore';

const icons: Record<string, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{icons[t.type]}</span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)} aria-label="Close">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
