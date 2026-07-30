import { describe, expect, it } from "vitest";
import { parseCueSheetText, parseOwnerSegments } from "@/lib/cueSheet";
import { summerCueSheetCsv } from "./fixtures/summerCueSheet";

describe("큐싯 구간 파서", () => {
  it("2026 여름 실제 큐싯을 22블록·24구간·214동선·미정 5건으로 무손실 표현한다", () => {
    const parsed = parseCueSheetText(summerCueSheetCsv);
    expect(parsed.blocks).toHaveLength(22);
    expect(parsed.segments).toHaveLength(24);
    expect(parsed.movementDrafts).toHaveLength(214);
    expect(parsed.importStats.tbdCount).toBe(5);
  });

  it("화살표 구간·상하 구역·상세·선후밥·미정·비스탭 주체를 보존한다", () => {
    const block = {
      day: 2,
      start: "18:00",
      end: "19:30",
      label: "저녁식사",
      owner: [
        "* (아래) 숙소 -> 식당",
        "- 층장: 박혜원sf(C동 3,4층), sf [후밥]",
        "* 식당 -> 강당",
        "- 물 배부: 행정팀",
        "- 방 뒷정리: 이가드sf",
      ].join("\n"),
    };
    const parsed = parseOwnerSegments(block);

    expect(parsed.segments).toEqual([
      expect.objectContaining({ order: 1, label: "숙소 → 식당", zone: "아래" }),
      expect.objectContaining({ order: 2, label: "식당 → 강당" }),
    ]);
    expect(parsed.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        segmentOrder: 1,
        postName: "층장",
        staffName: "박혜원",
        detail: "C동 3,4층",
        round: "후밥",
      }),
      expect.objectContaining({
        segmentOrder: 1,
        postName: "층장",
        staffName: null,
        slot: 1,
        round: "후밥",
      }),
      expect.objectContaining({ segmentOrder: 2, postName: "물 배부", actor: "행정팀" }),
      expect.objectContaining({ segmentOrder: 2, postName: "방 뒷정리", actor: "이가드sf" }),
    ]));
  });

  it("화살표 없는 소제목 이후 업무는 기본 구간(order=0)에 둔다", () => {
    const parsed = parseOwnerSegments({
      day: 1,
      start: "15:00",
      label: "출발 및 도착",
      owner: "* 도착 동선\n- 야외: 황현민sf",
    });
    expect(parsed.segments).toEqual([]);
    expect(parsed.movements[0]).toEqual(expect.objectContaining({
      segmentOrder: 0,
      staffName: "황현민",
    }));
  });

  it("시간·날짜·자정 정규화를 끝낸 블록 키에 구간을 연결한다", () => {
    const csv = [
      "구분,시간,내용,담당,기타",
      "2 일 차,,,,",
      "\"간식 및 취침\",\"00:30~03:00\",,\"* 강당 -> 숙소",
      "- 로비: 박혜원sf\",",
    ].join("\n");
    const parsed = parseCueSheetText(csv);
    expect(parsed.blocks[0]).toEqual(expect.objectContaining({ day: 1, start: "24:30", end: "27:00" }));
    expect(parsed.segments[0]).toEqual(expect.objectContaining({ blockKey: "1__24:30", order: 1 }));
    expect(parsed.movementDrafts[0]).toEqual(expect.objectContaining({ blockKey: "1__24:30", segmentOrder: 1 }));
  });

  it("출발 전 교회 담당은 owner에 남기고 현장 동선으로 중복 생성하지 않는다", () => {
    const csv = [
      "구분,시간,내용,담당,기타",
      "1 일 차,,,,",
      "등록,14:00~15:00,,\"- 등록: 박혜원sf\",",
      "출발 및 도착,15:00~16:00,,\"- 야외: 박혜원sf\",",
    ].join("\n");
    const parsed = parseCueSheetText(csv);
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.movementDrafts).toHaveLength(1);
    expect(parsed.movementDrafts[0]).toEqual(expect.objectContaining({ postName: "야외" }));
  });
});
