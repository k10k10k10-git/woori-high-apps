export type AdminStatusTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

// 상태 계산은 각 업무 모델에서 맡고, 여기서는 확인된 문구의 표시만 통일한다.
const statusTones: Record<string, AdminStatusTone> = {
  '연락 필요': 'danger', '연속 결석': 'danger',
  '출석 입력 확인': 'warning', '등반일 확인 필요': 'warning', '출석부 연결 확인': 'warning',
  '미입력': 'warning', '확인 필요': 'warning', '학생 연결 확인 필요': 'warning',
  '연결 확인 필요': 'warning', '관리자 확인 대기': 'warning', '준비 필요': 'warning',
  '등록 결정': 'warning', '반배정': 'warning', '출석부 반영': 'warning', '미정': 'warning',
  '이미 명단 있음': 'warning',
  '출석 흐름 확인': 'info', '관찰 중': 'info', '입력 중': 'info',
  '1주차': 'info', '2주차': 'info', '등록': 'info', '저장 중': 'info',
  '초기 4주 출석 양호': 'success', '다시 출석': 'success', '입력 완료': 'success',
  '처리 완료': 'success', '반영 완료': 'success', '완료': 'success',
  '관찰 기간 부족': 'neutral', '장결': 'neutral', '장결 학생': 'neutral',
  '일반': 'neutral', '일반 학생': 'neutral', '보류': 'neutral', '종료': 'neutral',
  '학생 없음': 'neutral', '출석 대상 없음': 'neutral', '조회 주일 없음': 'neutral',
  'A': 'success', 'B': 'info', 'C': 'warning', 'D': 'danger',
};

export function adminStatusTone(label: string): AdminStatusTone {
  return Object.prototype.hasOwnProperty.call(statusTones, label) ? statusTones[label] : 'neutral';
}
