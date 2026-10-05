'use client';
import { useApp } from '@/store/AppContext';

/** 현재 세션에서 서버 응답으로 확인한 마지막 단건 저장 시각이다. 입력 완료율과 구분한다. */
export default function AttendanceSaveStatus() {
  const { state } = useApp();
  const label = state.saveStatus === 'saving' ? '출석 저장 중'
    : state.saveStatus === 'error' ? '출석 저장 실패'
    : state.saveStatus === 'unknown' ? '출석 저장 확인 필요'
    : state.saveStatus === 'saved' ? '출석 저장됨' : '';
  const at = state.lastAttendanceSavedAt;
  const time = at ? new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(at) : null;
  if (!label && !time) return null;
  return <span className={`attendance-save-status ${state.saveStatus}`}>
    <span>{label}</span>
    {time && <small title="현재 로그인 세션에서 마지막으로 확인된 단건 출석 저장입니다. 전체 출석 입력 완료를 뜻하지 않습니다.">마지막 확인 <time dateTime={new Date(at!).toISOString()}>{time}</time> (KST)</small>}
  </span>;
}
