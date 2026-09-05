import React, { lazy, Suspense, useMemo, useSyncExternalStore } from 'react';
import { getSundaysForYear, evKey, getKSTYear } from '@/utils/dates';

type MockRef = { path: string; key: string | null };
type Entry = { operation: string; path: string };
const params = new URLSearchParams(window.location.search);
export const qa = {
  role: params.get('role') || 'admin',
  scenario: params.get('state') || 'populated',
  fault: params.get('fault') || 'attendance',
  delay: Math.max(0, Math.min(10_000, Number(params.get('delay') || 180))),
  reads: [] as Entry[], writes: [] as Entry[], blockedNetwork: [] as Entry[],
  actions: [] as string[],
  recover() { qa.scenario = 'populated'; },
  inspect() { return { role: qa.role, scenario: qa.scenario, reads: qa.reads.slice(), writes: qa.writes.slice(), blockedNetwork: qa.blockedNetwork.slice(), actions: qa.actions.slice(), url: window.location.pathname + window.location.search }; },
};
Object.assign(window, { __ATTENDANCE_ADMIN_QA__: qa });

function networkTarget(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input), window.location.href);
}
function denyNetwork(operation: string, target: URL): never {
  qa.blockedNetwork.push({ operation, path: target.origin + target.pathname });
  throw new Error(`합성 QA가 네트워크를 차단했습니다: ${operation} ${target.origin}`);
}
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const target = networkTarget(input);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (target.origin !== window.location.origin || !['GET', 'HEAD'].includes(method)) return denyNetwork(method, target);
  return originalFetch(input, init);
};
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
  const target = networkTarget(url);
  if (target.origin !== window.location.origin || !['GET', 'HEAD'].includes(method.toUpperCase())) return denyNetwork(method, target);
  return (originalOpen as Function).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;
const OriginalWebSocket = window.WebSocket;
window.WebSocket = class extends OriginalWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const target = new URL(url, window.location.href);
    if (target.hostname !== '127.0.0.1' || target.port !== '4178') denyNetwork('WEBSOCKET', target);
    super(url, protocols);
  }
};
Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: (url: string | URL) => { qa.blockedNetwork.push({ operation: 'BEACON', path: networkTarget(url).origin }); return false; } });
window.confirm = () => { qa.actions.push('confirm:cancelled'); return false; };
window.open = (url?: string | URL) => { const target = networkTarget(url ?? 'about:blank'); return denyNetwork('WINDOW_OPEN', target); };
document.addEventListener('click', event => {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!anchor) return;
  const target = networkTarget(anchor.getAttribute('href')!);
  if (target.origin !== window.location.origin) { event.preventDefault(); event.stopImmediatePropagation(); qa.blockedNetwork.push({ operation: 'ANCHOR', path: target.origin + target.pathname }); }
}, true);
document.addEventListener('submit', event => { event.preventDefault(); }, true);

const routeListeners = new Set<() => void>();
const emitRoute = () => routeListeners.forEach(listener => listener());
window.addEventListener('popstate', emitRoute);
const subscribeRoute = (listener: () => void) => { routeListeners.add(listener); return () => { routeListeners.delete(listener); }; };
const routeSnapshot = () => window.location.pathname + window.location.search;
export function usePathname() { return useSyncExternalStore(subscribeRoute, routeSnapshot).split('?')[0] || '/dashboard'; }
export function useSearchParams() { const location = useSyncExternalStore(subscribeRoute, routeSnapshot); return useMemo(() => new URLSearchParams(location.split('?')[1]), [location]); }
function navigate(href: string, replace = false) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) return denyNetwork('NAVIGATE', target);
  for (const key of ['role', 'state', 'fault', 'delay', 'chrome', 'online']) if (!target.searchParams.has(key) && params.has(key)) target.searchParams.set(key, params.get(key)!);
  qa.actions.push(`navigate:${target.pathname}${target.search}`);
  window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
  emitRoute();
  window.scrollTo(0, 0);
}
const router = { push: (url: string) => navigate(url), replace: (url: string) => navigate(url, true), back: () => window.history.back(), forward: () => window.history.forward(), refresh: () => emitRoute(), prefetch: () => Promise.resolve() };
export function useRouter() { return router; }
export default function Link({ href, onClick, children, prefetch: _prefetch, replace, scroll: _scroll, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; replace?: boolean; scroll?: boolean }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank' || href.startsWith('#')) return;
    event.preventDefault(); navigate(href, replace);
  }}>{children}</a>;
}
export function dynamic(loader: () => Promise<{ default: React.ComponentType<any> } | React.ComponentType<any>>, options: { loading?: React.ComponentType; ssr?: boolean } = {}) {
  const Component = lazy(async () => { const loaded = await loader(); return { default: typeof loaded === 'function' ? loaded : loaded.default }; });
  const Loading = options.loading;
  return function FixtureDynamic(props: Record<string, unknown>) { return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>; };
}

export const db = Object.freeze({ synthetic: true });
export const auth = Object.freeze({ currentUser: { uid: 'qa-synthetic-admin', displayName: '가상 관리자', email: 'admin@example.test' } });
export const ref = (_db: unknown, path = ''): MockRef => ({ path: path.replace(/^\/+|\/+$/g, ''), key: path.split('/').filter(Boolean).at(-1) ?? null });
export const child = (parent: MockRef, path: string) => ref(db, `${parent.path}/${path}`);
const years = new Map<number, Record<string, any>>();
function yearData(year: number) {
  if (years.has(year)) return years.get(year)!;
  const classes: Record<string, any> = {};
  const attendance: Record<string, any> = {};
  const definitions = [ ['1-1-1', 6, 'complete'], ['1-1-2', 7, 'partial'], ['1-2-1', 5, 'missing'], ['1-3-1', 2, 'jang'], ['2-1-1', 8, 'complete'], ['2-2-1', 6, 'partial'], ['2-3-1', 0, 'empty'] ] as const;
  definitions.forEach(([ck, count, status], classIndex) => {
    const students: Record<string, any> = {};
    const records: Record<string, any> = {};
    for (let index = 0; index < count; index++) {
      const sid = `qa_${ck.replaceAll('-', '_')}_${index + 1}`;
      const jang = status === 'jang' || (status === 'complete' && index === count - 1);
      students[sid] = { name: `가상학생 ${classIndex + 1}${String(index + 1).padStart(2, '0')}`, num: index + 1, school: '가상고등학교', birth: `${year - 17}-03-12`, jang, personId: `person_student_${sid}` };
      const weeks: Record<string, string> = {};
      getSundaysForYear(year).forEach(({ sundays }, monthIndex) => sundays.forEach((_day, sundayIndex) => {
        if (status === 'complete' || (status === 'partial' && index < 3)) weeks[evKey(monthIndex, sundayIndex)] = jang ? 'X' : index % 5 === 3 ? 'X' : index % 5 === 2 ? 'T' : 'O';
      }));
      if (Object.keys(weeks).length) records[sid] = weeks;
    }
    classes[ck] = { teacher: `가상교사 ${['가람', '나래', '다온', '라온', '마루', '바다', '새봄'][classIndex]}`, students };
    if (Object.keys(records).length) attendance[ck] = records;
  });
  const data = {
    classes, attendance,
    events: { qa_event: { month: '9', day: '13', label: '가상 공동예배' }, qa_event2: { month: '12', day: '20', label: '가상 성탄행사' } },
    suggestions: { '1-1-1': { qa_suggestion1: { text: '다음 주 모임 장소를 출석부에서 함께 확인할 수 있으면 좋겠습니다. (합성 의견)', author: '가상교사 가람', createdAt: Date.UTC(year, 8, 5, 3) } }, '2-2-1': { qa_suggestion2: { text: '공동예배 일정 공지를 미리 공유해 주세요. (합성 의견)', author: '가상교사 바다', createdAt: Date.UTC(year, 8, 4, 8) } } },
    teacherStaff: { qa_staff: { title: '담당 교역자', name: '가상스탭 하늘', phone: '', birth: '1990-01-01', personId: 'person_staff_qa_staff' } },
    teacherSpecial: { '1': [{ title: '부장', name: '가상교사 한결', phone: '' }, { title: '회계', name: '가상교사 이든', phone: '' }, { title: '행정', name: '가상교사 소담', phone: '' }], '2': [{ title: '부장', name: '가상교사 윤슬', phone: '' }] },
    teacherExtra: { '1': { '1_1_1': { name: '가상교사 가람', title: '1학년 1반 담임', phone: '', personId: 'person_teacher_qa_1' } }, '2': {} },
    teacherPhones: { '1': {}, '2': {} },
    teacherAdditional: { '1': { qa_assistant: { title: '보조 교사', name: '가상교사 여울', phone: '', personId: 'person_teacher_qa_assistant' } }, '2': {} },
  };
  years.set(year, data);
  return data;
}
function readPath(path: string): any {
  if (qa.scenario === 'empty') return null;
  const [root, year, ...rest] = path.split('/');
  if (root === 'userRoles') {
    const roles = {
      admin_example_test: { role: 'admin', name: '가상 관리자', email: 'admin@example.test' },
      teacher1_example_test: { role: 'teacher', name: '가상교사 가람', email: 'teacher1@example.test', part: '1', grade: '1', class: '1' },
      teacher2_example_test: { role: 'teacher', name: '가상교사 나래', email: 'teacher2@example.test', part: '1', grade: '1', class: '2' },
      teacher3_example_test: { role: 'teacher', name: '가상교사 바다', email: 'teacher3@example.test', part: '2', grade: '2', class: '1' },
    };
    return year ? roles[year as keyof typeof roles] ?? null : roles;
  }
  if (path === 'config/sheetSync') return { bu1Url: 'https://docs.google.com/spreadsheets/d/QA_SYNTHETIC_1/edit', bu2Url: 'https://docs.google.com/spreadsheets/d/QA_SYNTHETIC_2/edit' };
  if (!year) return Object.fromEntries([getKSTYear() - 1, getKSTYear()].map(value => [value, yearData(value)[root] ?? null]));
  let value: any = yearData(Number(year))[root];
  for (const key of rest) value = value?.[key];
  return value ?? null;
}
function isFault(path: string) { return qa.scenario === 'error' && (qa.fault === 'all' || path === qa.fault || path.startsWith(`${qa.fault}/`)); }
function readError() { return Object.assign(new Error('합성 QA 읽기 권한 오류'), { code: 'PERMISSION_DENIED' }); }
function snapshot(path: string) {
  const value = readPath(path);
  return { key: path.split('/').at(-1), exists: () => value !== null && value !== undefined, val: () => structuredClone(value), child: (key: string) => snapshot(`${path}/${key}`), forEach: (visit: (item: unknown) => void) => { for (const key of Object.keys(value ?? {})) visit(snapshot(`${path}/${key}`)); } };
}
export async function get(target: MockRef) {
  qa.reads.push({ operation: 'get', path: target.path });
  if (qa.scenario === 'loading') return new Promise<ReturnType<typeof snapshot>>(() => {});
  await new Promise(resolve => setTimeout(resolve, qa.delay));
  if (isFault(target.path)) throw readError();
  return snapshot(target.path);
}
export function onValue(target: MockRef, callback: (value: ReturnType<typeof snapshot>) => void, onError?: (error: Error) => void) {
  qa.reads.push({ operation: 'onValue', path: target.path });
  let active = true;
  const timer = setTimeout(() => {
    if (!active || qa.scenario === 'loading') return;
    if (isFault(target.path)) { onError?.(readError()); return; }
    callback(snapshot(target.path));
  }, qa.delay);
  return () => { active = false; clearTimeout(timer); };
}
function blockedWrite(operation: string, target?: MockRef): never {
  qa.writes.push({ operation, path: target?.path ?? '(root)' });
  throw new Error(`합성 QA는 모든 DB 쓰기를 차단합니다: ${operation}`);
}
export const set = (target: MockRef, ..._data: unknown[]) => blockedWrite('set', target);
export const update = (target: MockRef, ..._data: unknown[]) => blockedWrite('update', target);
export const remove = (target: MockRef) => blockedWrite('remove', target);
export const push = (target: MockRef, ..._data: unknown[]) => blockedWrite('push', target);
export const runTransaction = (target: MockRef, ..._data: unknown[]) => blockedWrite('runTransaction', target);
export const onDisconnect = (target: MockRef) => ({ set: () => blockedWrite('onDisconnect.set', target), update: () => blockedWrite('onDisconnect.update', target), remove: () => blockedWrite('onDisconnect.remove', target), cancel: () => blockedWrite('onDisconnect.cancel', target) });
export const off = () => {};
