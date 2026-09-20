import { Suspense } from 'react';
import ManageWorkspace from '@/components/admin/ManageWorkspace';

export default function ManagePage() {
  return <Suspense fallback={<p role="status">명단을 불러오고 있습니다.</p>}><ManageWorkspace /></Suspense>;
}
