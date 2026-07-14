import { describe, expect, it } from "vitest";
import { prepareTeacherUpdate } from "./teacherWrite";

describe("교사 수정 필드 삭제", () => {
  it("부분참에서 전참으로 바꾸며 비운 메모와 일정 필드를 null 삭제로 만든다", () => {
    expect(prepareTeacherUpdate({
      status: "전참",
      note: "",
      arrivalInfo: undefined,
      transport: undefined,
    })).toEqual({
      status: "전참",
      note: null,
      arrivalInfo: null,
      transport: null,
    });
  });

  it("부분 업데이트에 없던 필드는 삭제 대상으로 새로 만들지 않는다", () => {
    expect(prepareTeacherUpdate({ name: "이미진", status: "전참" })).toEqual({
      name: "이미진",
      status: "전참",
    });
  });

  it("남겨 둔 메모와 일정 값은 보존한다", () => {
    expect(prepareTeacherUpdate({ note: "개별 메모", arrivalInfo: "토요일 도착" })).toEqual({
      note: "개별 메모",
      arrivalInfo: "토요일 도착",
    });
  });
});
