// `@/lib/rtdbRest` 자리. 운영 모듈은 Firebase REST 모양 요청(`/{경로}.json?auth=…`, ETag·If-Match, 루트 PATCH)을
// Supabase api.rtdb_* 로 옮긴다. 시험에서는 같은 요청을 에뮬레이터 RTDB REST 로 그대로 보내 원천 Rules 가 판정하게 한다.
// 이관 전 하네스와 같은 주소라 시험의 page.route('**/attendance/**/*.json?**') 가로채기도 그대로 맞는다.
// 계약 시험 __tests__/rosterRecovery.integration.test.ts 의 vi.mock 과 같은 값이다.
import './firebase';

export const RTDB_REST_URL = 'http://127.0.0.1:19017?ns=demo-attendance-recovery-default-rtdb';

/** 호출 때마다 globalThis.fetch 를 읽어 Playwright 가로채기·네트워크 차단이 그대로 적용되게 한다. */
export const rtdbRestFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => globalThis.fetch(input, init);
