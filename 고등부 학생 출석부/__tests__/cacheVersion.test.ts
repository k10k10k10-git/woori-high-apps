import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { updateCacheVersion } = require('../tools/update-cache-version.js') as {
  updateCacheVersion: (file: string, version?: string) => string;
};

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

describe('서비스워커 캐시 버전', () => {
  it('같은 날 다시 배포해도 서로 다른 배포 버전으로 교체할 수 있다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'woori-cache-'));
    tempDirs.push(dir);
    const sw = join(dir, 'sw.js');
    writeFileSync(sw, "const CACHE_NAME = 'woori-att-20260813';\n");

    expect(updateCacheVersion(sw, 'deploy-1')).toBe('woori-att-deploy-1');
    expect(updateCacheVersion(sw, 'deploy-2')).toBe('woori-att-deploy-2');
    expect(readFileSync(sw, 'utf8')).toContain("'woori-att-deploy-2'");
  });

  it('캐시 이름을 찾지 못하면 조용히 배포하지 않고 실패한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'woori-cache-'));
    tempDirs.push(dir);
    const sw = join(dir, 'sw.js');
    writeFileSync(sw, "const CACHE_NAME = 'unexpected';\n");

    expect(() => updateCacheVersion(sw, 'deploy-1')).toThrow('기존 캐시 버전을 찾지 못했습니다');
  });
});
