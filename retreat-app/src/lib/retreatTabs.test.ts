import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("행정사이트 탭 분류 계약", () => {
  it("기존 인덱스를 유지한 채 17개 탭을 5개 그룹으로 분류한다", () => {
    const source = read("../app/retreat/[id]/RetreatPageClient.tsx");
    const groupSource = source.slice(
      source.indexOf("const TAB_GROUPS = ["),
      source.indexOf("] as const;", source.indexOf("const TAB_GROUPS = [")),
    );
    const groups = [...groupSource.matchAll(/label: "([^"]+)",\n\s+tabs:/g)]
      .map(match => match[1]);
    const tabs = [...groupSource.matchAll(/\{ label: "([^"]+)", idx: (\d+) \}/g)]
      .map(match => ({ label: match[1], idx: Number(match[2]) }));

    expect(groups).toEqual(["명단", "편성", "이동·참석", "물품·비용", "현장"]);
    expect(tabs).toEqual([
      { label: "신청 접수", idx: 0 },
      { label: "반별 명단", idx: 7 },
      { label: "입금 대조", idx: 12 },
      { label: "취소·환불", idx: 9 },
      { label: "조편성", idx: 1 },
      { label: "방배정", idx: 2 },
      { label: "교사 참석", idx: 4 },
      { label: "부분 참석", idx: 6 },
      { label: "카풀·자차", idx: 5 },
      { label: "여행자 보험", idx: 8 },
      { label: "단체티", idx: 13 },
      { label: "구매 물품", idx: 10 },
      { label: "물품 재고", idx: 16 },
      { label: "식사 인원", idx: 15 },
      { label: "현장 등록", idx: 11 },
      { label: "건강 특이사항", idx: 3 },
      { label: "의료 일지", idx: 14 },
    ]);
    expect([...new Set(tabs.map(tab => tab.idx))].sort((a, b) => a - b))
      .toEqual(Array.from({ length: 17 }, (_, index) => index));
  });

  it("탭 이름과 DB에 저장되는 행정물품 분류를 혼동하지 않는다", () => {
    const supplies = read("../app/retreat/[id]/SuppliesTab.tsx");
    const adminSupplies = read("../app/retreat/[id]/AdminSuppliesTab.tsx");
    const types = read("./types.ts");

    expect(supplies).toContain("물품 (행정물품 비용)");
    expect(supplies).toContain("물품 예산 (행정물품 비용)");
    expect(adminSupplies).toContain('"행정물품": "🗂️"');
    expect(types).toContain('ADMIN_SUPPLY_KINDS = ["행정물품", "의약품"]');
  });
});
