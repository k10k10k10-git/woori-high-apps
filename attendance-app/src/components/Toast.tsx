'use client';
import { useState, useEffect, useRef } from 'react';
import { subscribeToast } from '@/utils/toast';
import type { ToastType } from '@/utils/toast';

type ToastItem = { id: number; msg: string; type: ToastType };

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = subscribeToast((msg, type) => {
      const id = ++sequence.current;
      setToasts(prev => [...prev, { id, msg, type }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3500);
      timers.add(timer);
    });
    return () => { unsubscribe(); timers.forEach(clearTimeout); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} aria-atomic="true" className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
