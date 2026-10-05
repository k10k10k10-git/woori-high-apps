import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('../src/app/styles/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
it.each([
  ['primary', '#ffffff'], ['green', '#ffffff'], ['red', '#ffffff'], ['text3', 'surface2'],
  ['green-text', 'green-bg'], ['red-text', 'red-bg'], ['amber-text', 'amber-bg'], ['purple-text', 'purple-bg'],
])('전역 의미 색상 %s와 %s는 작은 글자에도 4.5:1 이상 대비를 제공한다', (foreground, background) => {
  const a = luminance(tokens[foreground]), b = luminance(tokens[background] ?? background);
  expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
});
