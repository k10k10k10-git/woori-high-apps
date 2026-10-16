import AdminTab from '@/components/tabs/AdminTab';
import { Suspense } from 'react';

export default function AdminPage() {
  return <Suspense fallback={<p role="status">운영 설정을 불러오고 있습니다.</p>}><AdminTab /></Suspense>;
}
