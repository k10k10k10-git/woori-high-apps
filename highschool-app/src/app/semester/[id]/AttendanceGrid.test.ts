import { describe, expect, it } from "vitest";
import { attendanceMenuPosition } from "./attendanceGridPosition";

describe("출석 표 상태 메뉴 위치", () => {
  it("셀 아래 공간이 충분하면 바로 아래에 표시한다", () => {
    expect(attendanceMenuPosition(
      { left: 200, top: 100, right: 244, bottom: 136, width: 44 },
      { width: 800, height: 700 },
    )).toEqual({ left: 148, top: 140 });
  });

  it("화면 아래에서는 셀 위로 올리고 좌우 화면 밖으로 나가지 않는다", () => {
    expect(attendanceMenuPosition(
      { left: 760, top: 620, right: 804, bottom: 656, width: 44 },
      { width: 800, height: 700 },
    )).toEqual({ left: 644, top: 476 });
  });
});
