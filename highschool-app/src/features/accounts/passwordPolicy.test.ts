import { describe, expect, it } from "vitest";
import { accountPasswordProblem, parseAccountPasswordInput } from "./passwordPolicy";

describe("관리자 비밀번호 정하기 규칙", () => {
  it("메일함 없는 @woorihigh.com 계정만 받고 이메일은 소문자로 맞춘다", () => {
    expect(parseAccountPasswordInput({ email: " Team01@WooriHigh.com ", password: "abcd1234" })).toEqual({ email: "team01@woorihigh.com", password: "abcd1234" });
    expect(accountPasswordProblem("staff@gmail.com", "abcd1234")).toContain("@woorihigh.com 계정의 비밀번호만");
    expect(accountPasswordProblem("woorihigh.com", "abcd1234")).toContain("이메일 주소");
  });
  it("짧거나 너무 길거나 앞뒤 빈칸이 있는 비밀번호를 거절한다", () => {
    expect(accountPasswordProblem("a@woorihigh.com", "short")).toContain("8자 이상");
    expect(accountPasswordProblem("a@woorihigh.com", "가".repeat(25))).toContain("너무 깁니다");
    expect(accountPasswordProblem("a@woorihigh.com", " abcd1234")).toContain("빈칸");
    expect(accountPasswordProblem("a@woorihigh.com", "abcd1234")).toBeNull();
  });
  it("역할·uid 같은 다른 필드는 받지 않는다", () => {
    expect(parseAccountPasswordInput({ email: "a@woorihigh.com", password: "abcd1234", uid: "admin" })).toBe("요청 내용을 읽을 수 없습니다.");
    expect(parseAccountPasswordInput(["a@woorihigh.com"])).toBe("요청 내용을 읽을 수 없습니다.");
    expect(parseAccountPasswordInput({ email: "a@woorihigh.com", password: 12345678 })).toBe("이메일과 비밀번호를 입력해 주세요.");
  });
});
