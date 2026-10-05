/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { csvContent, escapeHtml, openPrintWindow } from './export';

it('악성 학생명·행사명은 실행 가능한 HTML 대신 텍스트로 출력한다', () => {
  const value = '<img src=x onerror="alert(1)"><script>alert(2)</script>&';
  const doc = new DOMParser().parseFromString(`<table><tr><td>${escapeHtml(value)}</td></tr></table>`, 'text/html');
  expect(doc.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
  expect(doc.querySelector('td')?.textContent).toBe(value);
});
it('CSV 셀의 수식·제어문자·선행 공백 공격을 문자로 내보내고 한글·인용부호는 보존한다', () => {
  expect(csvContent([['=1+1', '+821000001111', '-1', '@SUM(A1)', '  =HYPERLINK("x")', '\t=1', '합성 학생', '학교,"이름"']]))
    .toBe('"\'=1+1","\'+821000001111","\'-1","\'@SUM(A1)","\'  =HYPERLINK(""x"")","\'\t=1","합성 학생","학교,""이름"""');
});
it('인쇄 문서를 쓰기 전에 opener를 해제한다', () => {
  const popup = { opener: window as Window | null, document: { write: vi.fn(), close: vi.fn() } };
  popup.document.write.mockImplementation(() => expect(popup.opener).toBeNull());
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  expect(openPrintWindow('<p>명단</p>')).toBe(true);
  vi.restoreAllMocks();
});
