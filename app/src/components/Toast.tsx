import { useEffect } from 'react';

export type ToastState = { message: string; action?: { label: string; run: () => void } } | null;

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button className="ghost" onClick={() => { toast.action!.run(); onClose(); }}>{toast.action.label}</button>
      )}
    </div>
  );
}
