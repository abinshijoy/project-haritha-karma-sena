import { useEffect } from 'react';
import type { Toast } from '../types';
import { Icon } from './Icon';

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 5000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      <Icon name={toast.kind === 'warning' ? 'alert' : 'check'} size={16} />
      <span>{toast.message}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
