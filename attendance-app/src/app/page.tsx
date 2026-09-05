'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import { isDemoAccount } from '@/lib/demo';
import { homePathForRole } from '@/lib/adminNavigation';

export default function Home() {
  const { state } = useApp();
  const router = useRouter();
  const target = homePathForRole(state.userRole, isDemoAccount(state.userRole?.email));

  useEffect(() => {
    if (state.userRole) router.replace(target);
  }, [router, state.userRole, target]);

  return <p role="status" style={{ padding: 28, color: 'var(--text2)', fontSize: 14 }}>출석부를 열고 있습니다.</p>;
}
