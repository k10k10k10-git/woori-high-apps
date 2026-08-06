// Firebase 구독/읽기 오류를 사용자에게 정확히 설명하기 위한 순수 유틸.
//
// 권한 거부(PERMISSION_DENIED)를 "네트워크를 확인해 주세요"로 안내하면
// 관리자 권한이 없는 계정이 네트워크 문제로 오해한다(실제로 겪은 혼선).
// 두 원인을 분리해서 보여준다.

export function isPermissionDenied(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.toUpperCase().includes('PERMISSION_DENIED')) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /permission[_ ]denied|permission to access/i.test(message);
}

/** 데이터 로드 실패 토스트 문구 — label 예: "학생/반", "출석", "이벤트" */
export function dataLoadMessage(label: string, err: unknown): string {
  return isPermissionDenied(err)
    ? `${label} 데이터를 볼 권한이 없습니다. 관리자 승인이 필요합니다.`
    : `${label} 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.`;
}
