import { Suspense } from 'react';
import AttendanceManagement from '@/components/admin/AttendanceManagement';

export default function AttendancePage() {
  return (
    <Suspense fallback={<p role="status">출석 날짜를 불러오고 있습니다.</p>}>
      <AttendanceManagement />
    </Suspense>
  );
}
