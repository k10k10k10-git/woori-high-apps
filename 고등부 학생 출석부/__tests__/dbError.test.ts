import { describe, it, expect } from 'vitest';
import { dataLoadMessage, isPermissionDenied } from '@/utils/dbError';

describe('isPermissionDenied', () => {
  it('Firebase 권한 거부 코드를 인식한다', () => {
    expect(isPermissionDenied({ code: 'PERMISSION_DENIED' })).toBe(true);
    expect(isPermissionDenied({ code: 'permission_denied' })).toBe(true);
  });

  it('메시지만 있는 경우도 인식한다', () => {
    expect(isPermissionDenied(new Error("Client doesn't have permission to access the desired data."))).toBe(true);
  });

  it('네트워크·기타 오류는 권한 거부가 아니다', () => {
    expect(isPermissionDenied(new Error('network error'))).toBe(false);
    expect(isPermissionDenied({ code: 'UNAVAILABLE' })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});

describe('dataLoadMessage', () => {
  it('권한 거부는 승인 안내로 표시한다', () => {
    expect(dataLoadMessage('출석', { code: 'PERMISSION_DENIED' }))
      .toBe('출석 데이터를 볼 권한이 없습니다. 관리자 승인이 필요합니다.');
  });

  it('그 외에는 네트워크 안내를 유지한다', () => {
    expect(dataLoadMessage('학생/반', new Error('timeout')))
      .toBe('학생/반 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
  });
});
