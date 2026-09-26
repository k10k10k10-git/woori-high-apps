import type { ReportFriend } from '@/utils/pastoralReport';

/** 통합사이트의 공개 새친구 진행표에 필요한 필드만 사용한다. */
export type PublicReportFriend = ReportFriend & {
  school?: string;
  week1Date?: string;
  week2Date?: string;
  assignedClassKey?: string;
  createdAt?: string;
};

export type NewFriendStage = '1주차' | '2주차' | '등록 결정' | '반배정' | '출석부 반영' | '완료' | '보류' | '종료';
export type NewFriendRosterProgress = '대기' | '처리중' | '완료';

/** 통합사이트와 같은 진행 상태. 과거 선물 전달 기록은 완료로 읽되 실제 출석부 반영은 rosterSync로만 확인한다. */
export function deriveNewFriendRosterProgress(friend: PublicReportFriend): NewFriendRosterProgress {
  if (friend.rosterSync || friend.giftDate) return '완료';
  if (friend.week2Date || friend.decision === '등록' || friend.assignedClassKey) return '처리중';
  return '대기';
}

export function deriveNewFriendStage(friend: PublicReportFriend): NewFriendStage {
  if (friend.decision === '미등록') return '종료';
  if (friend.decision === '보류') return '보류';
  if (friend.rosterSync || friend.giftDate) return '완료';
  if (friend.assignedClassKey) return '출석부 반영';
  if (friend.decision === '등록') return '반배정';
  if (friend.week2Date) return '등록 결정';
  if (friend.week1Date) return '2주차';
  return '1주차';
}
