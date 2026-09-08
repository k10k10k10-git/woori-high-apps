import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
const subscribe = (listener: () => void) => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
const navigate = (url: string) => { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); };
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search));
const router = { push: navigate, replace: navigate };
export const useRouter = () => router;
export default function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={event => { onClick?.(event); if (!event.defaultPrevented && href?.startsWith('/')) { event.preventDefault(); navigate(href); } }} />;
}
