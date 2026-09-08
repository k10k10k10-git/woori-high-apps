import type { ReactNode } from 'react';
export const auth = { currentUser: { uid: 'synthetic', email: 'synthetic@example.test' } };
export const db = {};
export const ref = (_db: unknown, path: string) => path;
export const query = (path: string) => path;
export const orderByKey = () => null;
export const startAt = () => null;
export const endAt = () => null;
export const fixture = { friends: {} as Record<string, unknown> };
function snapshot(value: unknown, key = ''): object {
  return { key, val: () => value, child: (name: string) => snapshot((value as Record<string, unknown>)?.[name], name),
    forEach: (fn: (child: object) => void) => Object.entries((value ?? {}) as Record<string, unknown>).forEach(([k, v]) => fn(snapshot(v, k))) };
}
export function onValue(source: string, receive: (value: object) => void, fail: (error: Error) => void) {
  const timer = setTimeout(() => new URLSearchParams(location.search).has('error') ? fail(new Error('권한 없음')) : receive(snapshot(source.includes('-sunday/') ? fixture.friends : {})), 50);
  return () => clearTimeout(timer);
}
export const usePathname = () => '/pastoral';
export default function Link({ href, children, ...props }: { href: string; children: ReactNode }) { return <a href={href} {...props}>{children}</a>; }
