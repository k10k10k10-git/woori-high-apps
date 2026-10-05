import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import GlobalError from './global-error';
it('Context·글로벌 CSS 없이 한국어 복구 문서를 제공하고 원본 오류 정보는 노출하지 않는다', () => {
  const html = renderToStaticMarkup(<GlobalError error={new Error('민감한 내부 오류')} reset={() => {}} />);
  expect(html).toContain('<html lang="ko">');
  expect(html).toContain('다시 시도'); expect(html).toContain('href="/"');
  expect(html).not.toContain('민감한 내부 오류'); expect(html).not.toContain('user-scalable=no');
});
