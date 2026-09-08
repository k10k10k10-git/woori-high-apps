'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
};

export function useModalFocus({ containerRef, initialFocusRef, onDismiss }: Options) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const container = containerRef.current;
    (initialFocusRef?.current ?? container)?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusable = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
          && !element.closest('[hidden], [aria-hidden="true"]')
          && !(element instanceof HTMLInputElement && element.type === 'hidden')
          && getComputedStyle(element).display !== 'none'
          && getComputedStyle(element).visibility !== 'hidden');

      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!containerRef.current.contains(activeElement)) {
        event.preventDefault();
        (initialFocusRef?.current ?? first).focus({ preventScroll: true });
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      returnFocus?.focus({ preventScroll: true });
    };
  }, [containerRef, initialFocusRef]);
}
