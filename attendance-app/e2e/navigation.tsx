import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
const subscribe = (listener: () => void) => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
// Next App Router는 네이티브 History API 변경도 useSearchParams에 전달한다.
for (const method of ['pushState', 'replaceState'] as const) {
  const original = history[method].bind(history);
  history[method] = (...args: Parameters<History['pushState']>) => {
    original(...args);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
}
const navigate = (url: string) => { history.pushState(null, '', url); };
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search));
const router = { push: navigate, replace: (url: string) => { history.replaceState(null, '', url); } };
export const useRouter = () => router;
export default function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={event => { onClick?.(event); if (!event.defaultPrevented && href?.startsWith('/')) { event.preventDefault(); navigate(href); } }} />;
}
