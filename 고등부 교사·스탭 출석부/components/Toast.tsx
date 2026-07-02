'use client';

import { useEffect, useState } from 'react';
import { subscribeToast } from '@/utils/toast';
import type { ToastType } from '@/utils/toast';

export default function Toast() {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeToast((m, t) => {
      setMsg(m);
      setType(t);
      setVisible(true);
      setTimeout(() => setVisible(false), 2500);
    });
  }, []);

  if (!visible) return null;
  return (
    <div className={`toast toast-${type}`}>{msg}</div>
  );
}
