import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("기획 화면 가독성 계약", () => {
  it("숙소 탭 이름과 조스탭 추가 버튼이 읽기 쉬운 크기를 유지한다", () => {
    const client = read("src/app/retreat/[id]/IguardClient.tsx");
    const guide = read("src/app/retreat/[id]/InfoViews.tsx");

    expect(client).toContain('{ key: "lodgingmap", label: "숙소 배치도" }');
    expect(client).not.toContain('{ key: "lodgingmap", label: "배치도 관리" }');
    expect(guide).toContain("min-w-[96px] whitespace-nowrap px-4 text-sm");
  });

  it("큐싯 본문 셀은 내부 스크롤·잘림 없이 내용 높이만큼 모두 펼친다", () => {
    const schedule = read("src/app/retreat/[id]/ScheduleSheetEditor.tsx");
    expect(schedule).toContain('textarea.style.height = "auto"');
    expect(schedule).toContain("textarea.scrollHeight");
    expect(schedule).toContain("textarea.offsetHeight - textarea.clientHeight");
    expect(schedule).toContain("overflow-hidden");
    expect(schedule).toContain("resize-none");
    expect(schedule).toContain("!text-[11px]");
    expect(schedule).toContain("lg:min-h-[300px]");
    expect(schedule).toContain("assignmentLines.map");
    expect(schedule).not.toContain("assignmentLines.slice(0, 3)");
    expect(schedule).not.toContain('className="truncate text-[11px] text-slate-500"');
  });

  it("공백·과부하 경고 대신 미배치와 실제 배정 횟수를 분리한다", () => {
    const validation = read("src/app/retreat/[id]/ValidationView.tsx");
    expect(validation).not.toContain("공백 블록:");
    expect(validation).not.toContain("과부하 주의:");
    expect(validation).toContain("미배치 스탭");
    expect(validation).toContain("스탭별 동선 배정 횟수");
  });

  it("식사 순서는 가로 스크롤 없이 반응형 순번 그리드로 표시한다", () => {
    const meals = read("src/app/retreat/[id]/MealsView.tsx");
    expect(meals).toContain("grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-11");
    expect(meals).not.toContain("좌우로 밀어 전체 순서를 확인하세요");
    expect(meals).not.toContain('className="overflow-x-auto pb-2"');
  });
});
