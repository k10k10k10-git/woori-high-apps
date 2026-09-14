import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // 렌더 테스트는 파일 첫 줄의 `@vitest-environment jsdom` docblock으로 환경을 고른다
    // (Vitest 4에서 environmentMatchGlobs는 동작하지 않는다). 순수 로직 테스트는
    // node 환경 그대로라 실행 시간이 늘지 않는다.
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 70,
        functions: 65,
        statements: 65,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
