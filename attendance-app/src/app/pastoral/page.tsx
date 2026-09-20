import { Suspense } from 'react';
import PastoralReport from '@/components/admin/PastoralReport';

export default function Page() { return <Suspense fallback={<p role="status">목양 관리 화면을 불러오고 있습니다.</p>}><PastoralReport /></Suspense>; }
