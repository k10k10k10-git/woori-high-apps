// 시험 별칭 모듈(server.mjs)이 운영 모듈의 이름을 모두 내보내는지 tsc 가 확인한다. 브라우저에서는 로드하지 않는다.
// 앱이 별칭 모듈에서 새 이름을 가져오는데 시험 모듈에 없으면 화면 모듈 전체가 로드에 실패해, 시험이 실패 대신
// 시간 초과만 반복한다(2026-11-12 Actions 실행이 40분 넘게 돌았다). 앱이 쓰지 않는 운영 전용 도구만 제외 목록에 둔다.
import type * as ProductionClient from '@/lib/firebase/client';
import type * as ProductionRtdb from '@/lib/rtdb';
import type * as ProductionRest from '@/lib/rtdbRest';
import type * as ProductionAuth from '@/lib/supabaseAuth';
import type * as TestClient from './firebase';
import type * as TestRtdb from './rtdb';
import type * as TestRest from './rtdbRest';
import type * as TestAuth from './supabaseAuth';

type Missing<Production, Test, Unused extends PropertyKey = never> = Exclude<keyof Production, keyof Test | Unused>;
type None<T extends never> = T;

export type AliasParity = [
  None<Missing<typeof ProductionClient, typeof TestClient>>,
  None<Missing<typeof ProductionRtdb, typeof TestRtdb>>,
  None<Missing<typeof ProductionRest, typeof TestRest, 'createRtdbRestFetch'>>,
  None<Missing<typeof ProductionAuth, typeof TestAuth, 'AuthIdentityError' | 'toAuthError' | 'createSupabaseAuth'>>,
];
