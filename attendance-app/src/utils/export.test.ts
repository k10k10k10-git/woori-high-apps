/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { escapeHtml, openPrintWindow } from './export';

it('악성 학생명·행사명은 실행 가능한 HTML 대신 텍스트로 출력한다', () => {
  const value = '<img src=x onerror="alert(1)"><script>alert(2)</script>&';
  const doc = new DOMParser().parseFromString(`<table><tr><td>${escapeHtml(value)}</td></tr></table>`, 'text/html');
  expect(doc.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
  expect(doc.querySelector('td')?.textContent).toBe(value);
});
it('인쇄 문서를 쓰기 전에 opener를 해제한다', () => {
  const popup = { opener: window as Window | null, document: { write: vi.fn(), close: vi.fn() } };
  popup.document.write.mockImplementation(() => expect(popup.opener).toBeNull());
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  expect(openPrintWindow('<p>명단</p>')).toBe(true);
  vi.restoreAllMocks();
});
