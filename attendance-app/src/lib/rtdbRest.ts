// Firebase RTDB REST(`/{경로}.json?auth=…`) 자리.
//
// 출석부의 단발 저장 모듈(출석 셀·체크 PATCH, 관리 ETag 조건부 PUT, 학생 이동 잠금·PATCH, 특이사항·심방·장결·새친구 비고)은
// SDK 의 지연 쓰기 대기열을 피하려고 REST 를 직접 불렀다. 그 업무 코드는 그대로 두고, 요청만 이 함수가 받아
// Supabase `api.rtdb_*` 로 옮긴다(계약 1장). fetch 와 같은 모양이라 모듈의 `fetch` 주입 자리에 그대로 들어간다.
//
//  GET                     → rtdb_get           (값은 Firebase REST 처럼 숫자 키 객체를 배열로 바꿔 준다)
//  GET + X-Firebase-ETag   → rtdb_get_hashed    (ETag 헤더 = 서버 hash)
//  PUT + If-Match          → rtdb_cas           (다르면 412 + 지금 값·ETag)
//  PUT / DELETE            → rtdb_update({경로: 값|null})
//  PATCH                   → rtdb_update({경로/키: 값})  — 루트 PATCH 는 Firebase 다중 경로 갱신과 같다
//
// 상태 코드는 Firebase REST 와 같은 뜻으로 돌려준다: 규칙 거부·검증 실패 401, 조건 불일치 412.
// 네트워크가 끊겨 서버 반영 여부를 알 수 없으면 fetch 처럼 예외를 던진다(호출부가 "결과 불명"으로 처리한다).
// 로그인은 Supabase 세션이 맡으므로 주소의 `auth=` 값은 쓰지 않는다.
import { getSupabase } from '@/lib/supabase';
import { nodeToValue } from '@/lib/rtdb/ordering';
import { classifyRpcError, type RpcResponse, type SupabaseLike } from '@/lib/rtdb/transport';
import { normalize } from '@/lib/rtdb/tree';

/** 실제로 나가지 않는 주소. 이 주소로 만든 요청은 rtdbRestFetch 만 해석한다. */
export const RTDB_REST_URL = 'https://rtdb.invalid';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const INVALID_KEY = /[.#$[\]\u0000-\u001f\u007f]/;
const QUERY_PARAMS = ['orderBy', 'equalTo', 'startAt', 'endAt', 'startAfter', 'endBefore', 'limitToFirst', 'limitToLast', 'shallow'];

function json(body: unknown, status = 200, etag?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // 실제 서버 hash 는 md5 16진수다. 시험용 가짜 hash 의 한글 등도 헤더에 실을 수 있게 감싼다.
  if (etag !== undefined) headers.ETag = encodeURIComponent(etag);
  return new Response(JSON.stringify(body), { status, headers });
}

const failure = (status: number, error: string) => json({ error }, status);

function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('The operation was aborted.', 'AbortError')
    : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

/** Firebase REST 가 돌려주는 값 모양(SDK val() 과 같은 배열 변환). */
function restValue(data: unknown): unknown {
  return nodeToValue(normalize(data), false) ?? null;
}

function isRetryableAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, status } = error as { name?: string; status?: number };
  return name === 'AuthRetryableFetchError' || status === 0 || (typeof status === 'number' && status >= 500);
}

export function createRtdbRestFetch(client: () => SupabaseLike): Fetch {
  return async function rtdbRestFetch(input, init = {}) {
    const signal = init.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw abortError();
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!url.pathname.endsWith('.json')) return failure(404, 'Not Found');
    if (QUERY_PARAMS.some((name) => url.searchParams.has(name))) return failure(400, 'query parameters are not supported');
    let keys: string[];
    try {
      keys = url.pathname.slice(1, -'.json'.length).split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return failure(400, 'Invalid path');
    }
    if (keys.some((key) => INVALID_KEY.test(key))) return failure(400, 'Invalid path');
    const path = keys.join('/');
    const method = (init.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers);
    const join = (key: string) => [path, key].filter(Boolean).join('/');

    let supabase: SupabaseLike;
    try {
      supabase = client();
    } catch {
      // 공개 설정이 없으면 연결할 곳이 없다 — 저장하지 않은 "연결 실패"로 끝나게 한다.
      throw new TypeError('Failed to fetch: Supabase is not configured');
    }

    // 쓰기 전에 세션 복원·갱신을 기다린다. 갱신이 네트워크로 실패하면 익명으로 보내 "거절"로 오인하지 않게 연결 실패로 끝낸다.
    const sessionReady = async () => {
      if (!supabase.auth?.getSession) return;
      let error: unknown = null;
      try {
        ({ error } = await supabase.auth.getSession());
      } catch (cause) {
        error = cause;
      }
      if (error && isRetryableAuthError(error)) throw new TypeError('Failed to fetch: session refresh failed');
    };

    const rpc = async (fn: string, args: Record<string, unknown>): Promise<RpcResponse> => {
      const builder = supabase.schema('api').rpc(fn, args);
      if (signal && typeof builder.abortSignal === 'function') builder.abortSignal(signal);
      let response: RpcResponse;
      try {
        response = await builder;
      } catch (error) {
        if (signal?.aborted) throw abortError();
        throw new TypeError(`Failed to fetch: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (signal?.aborted) throw abortError();
      return response;
    };

    /** RPC 오류를 Firebase REST 응답으로. 서버 반영 여부를 모르면 예외. */
    const errorResponse = (response: RpcResponse): Response => {
      const error = response.error!;
      const kind = classifyRpcError(error, response.status);
      if (kind === 'denied' || kind === 'invalid') return failure(401, 'Permission denied');
      const status = response.status;
      if (kind === 'network') {
        if (status === undefined || status === 0) throw new TypeError(`Failed to fetch: ${error.message ?? ''}`);
        return failure(status >= 500 ? status : 503, 'Service Unavailable');
      }
      return failure(status !== undefined && status >= 400 ? status : 500, error.message ?? 'Internal Server Error');
    };

    const body = (): unknown => {
      const raw = init.body;
      if (typeof raw !== 'string') throw new SyntaxError('body must be a JSON string');
      return JSON.parse(raw);
    };

    if (method === 'GET') {
      if (headers.get('X-Firebase-ETag') === 'true') {
        const response = await rpc('rtdb_get_hashed', { p_path: path });
        if (response.error) return errorResponse(response);
        const data = (response.data ?? {}) as { value?: unknown; hash?: unknown };
        return json(restValue(data.value ?? null), 200, typeof data.hash === 'string' ? data.hash : '');
      }
      const response = await rpc('rtdb_get', { p_path: path });
      if (response.error) return errorResponse(response);
      return json(restValue(response.data));
    }

    if (method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return failure(405, 'Method Not Allowed');
    let value: unknown = null;
    try {
      if (method !== 'DELETE') value = body();
    } catch {
      return failure(400, 'Invalid data; couldn\'t parse JSON object.');
    }
    await sessionReady();

    const ifMatch = headers.get('If-Match');
    if (ifMatch !== null && method !== 'PATCH') {
      if (!path) return failure(400, 'conditional root writes are not supported');
      let expected: string;
      try {
        expected = decodeURIComponent(ifMatch);
      } catch {
        return failure(400, 'Invalid If-Match');
      }
      const response = await rpc('rtdb_cas', { p_path: path, p_expected: expected, p_value: value });
      if (response.error) return errorResponse(response);
      const result = (response.data ?? {}) as { committed?: unknown; value?: unknown; hash?: unknown };
      const hash = typeof result.hash === 'string' ? result.hash : '';
      return json(restValue(result.value ?? null), result.committed === true ? 200 : 412, hash);
    }

    let patch: Record<string, unknown>;
    if (method === 'PATCH') {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return failure(400, 'PATCH body must be an object');
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.some(([key]) => key.split('/').filter(Boolean).some((part) => INVALID_KEY.test(part)))) return failure(400, 'Invalid path');
      patch = Object.fromEntries(entries.map(([key, child]) => [join(key.split('/').filter(Boolean).join('/')), child]));
      if (Object.keys(patch).some((key) => key === '')) return failure(400, 'Invalid path');
    } else {
      // Firebase 는 루트 전체 덮어쓰기도 받지만 출석부는 쓰지 않는다. 사고를 막으려고 거절한다.
      if (!path) return failure(400, 'root writes are not supported');
      patch = { [path]: value };
    }
    const response = await rpc('rtdb_update', { p_patch: patch });
    if (response.error) return errorResponse(response);
    return json(method === 'DELETE' ? null : value);
  };
}

/** 앱 기본: 화면과 같은 Supabase 로그인 세션으로 보낸다. */
export const rtdbRestFetch: Fetch = createRtdbRestFetch(() => getSupabase() as unknown as SupabaseLike);
