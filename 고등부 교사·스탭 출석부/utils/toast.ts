export type ToastType = 'error' | 'success' | 'info';

type Listener = (msg: string, type: ToastType) => void;
const listeners: Listener[] = [];

export function showToast(msg: string, type: ToastType = 'error') {
  listeners.forEach(fn => fn(msg, type));
}

export function subscribeToast(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
