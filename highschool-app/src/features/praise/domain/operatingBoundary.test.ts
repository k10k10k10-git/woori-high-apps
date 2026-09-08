import { expect, it } from "vitest";
import { isPraiseHistoricalReadOnly } from "./operatingBoundary";
it("이관 경계 당일부터 운영하고 과거 기록은 보관한다",()=>{expect(isPraiseHistoricalReadOnly({readOnlyBefore:"2026-09-12"},"2026-09-05")).toBe(true);expect(isPraiseHistoricalReadOnly({readOnlyBefore:"2026-09-12"},"2026-09-12")).toBe(false);expect(isPraiseHistoricalReadOnly({},"2026-09-05")).toBe(false);});
