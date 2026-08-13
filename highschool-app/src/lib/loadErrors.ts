/**
 * 구독 실패를 "경로별"로 모아 배너 문구를 만드는 순수 로직.
 *
 * 왜 필요한가 (2026-08-08):
 * 학기·홈 화면은 실패를 단일 문자열 하나에 덮어써서, 5개 구독이 동시에 거부돼도
 * 마지막 하나만 보였다. 실제로 Rules 권한 공백을 진단할 때 `sessions` 한 경로만
 * 막힌 것처럼 보여 원인을 두 번 잘못 짚었다. 또 성공해도 지우는 코드가 없어
 * 원인이 해소된 뒤에도 배너가 영구히 남았다.
 */
export type LoadErrorMap = Record<string, string>;

/** 실패 기록. 같은 키에 같은 메시지면 이전 객체를 그대로 반환한다(불필요한 리렌더 방지). */
export function withError(prev: LoadErrorMap, key: string, message: string): LoadErrorMap {
  if (prev[key] === message) return prev;
  return { ...prev, [key]: message };
}

/** 해당 키가 성공했을 때 제거. 원래 없었으면 이전 객체를 그대로 반환한다. */
export function withoutError(prev: LoadErrorMap, key: string): LoadErrorMap {
  if (!(key in prev)) return prev;
  const next = { ...prev };
  delete next[key];
  return next;
}

/**
 * 배너 문구. 실패한 경로를 **전부** 이름으로 나열하고, 원인 메시지는 처음 것 하나만 붙인다
 * (권한 거부는 대개 원인이 하나라 같은 메시지가 반복된다).
 */
export function formatLoadErrors(errors: LoadErrorMap): string | null {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  return `${keys.join(" · ")} 불러오기 실패 - ${errors[keys[0]]}`;
}
