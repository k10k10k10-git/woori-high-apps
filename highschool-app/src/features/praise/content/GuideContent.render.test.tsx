/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuideContent, { PraiseResourceLibrary } from "./GuideContent";
import { createFirstMeetingGuide } from "./templates";

afterEach(cleanup);

describe("첫 모임 읽기 전용 가이드", () => {
  it("기본 운영 순서와 준비·역할·규칙을 표시한다", () => {
    render(<GuideContent showResources={false} />);
    expect(screen.getByRole("heading", { name: "찬양팀 첫 모임 가이드" })).toBeInTheDocument();
    for (const name of ["시작 전 준비", "역할별 진행", "진행 순서", "나눔마블 진행 규칙"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("60분")).toBeInTheDocument();
    expect(screen.getAllByText("회차에서 장소를 정해 주세요.")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "나눔마블 자료실" })).not.toBeInTheDocument();
  });

  it("편집된 회차의 장소·준비물·순서를 전달받아 그대로 표시한다", () => {
    const guide = createFirstMeetingGuide();
    guide.location = "합성 나눔실";
    guide.interviewLocation = "합성 면접실";
    guide.preparation = ["합성 악보"];
    guide.steps = [{ id: "custom", title: "합성 순서", durationMinutes: 15, instructions: ["합성 안내"] }];
    render(<GuideContent guide={guide} showResources={false} />);
    expect(screen.getByText("합성 나눔실")).toBeInTheDocument();
    expect(screen.getByText("합성 면접실")).toBeInTheDocument();
    expect(screen.getByText("합성 악보")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "진행 순서" })).getByText("15분")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "진행 순서" })).queryByText("1라운드 · 취향으로 가볍게")).not.toBeInTheDocument();
  });

  it("입력된 HTML을 실행하거나 다운로드 주소로 사용하지 않는다", () => {
    const guide = createFirstMeetingGuide();
    guide.title = '<script>alert("sample")</script>';
    guide.location = '<img src=x onerror="alert(1)">';
    const { container } = render(<GuideContent guide={guide} />);
    expect(screen.getByText(guide.title)).toBeInTheDocument();
    expect(screen.getByText(guide.location)).toBeInTheDocument();
    expect(container.querySelector("script, img, iframe")).toBeNull();
    screen.getAllByRole("link").forEach((link) => expect(link.getAttribute("href")).toMatch(/^\/praise-resources\//));
  });

  it("빈 배열은 빈 안내로 표시하고 참고 안내는 기본 접힌 상태다", () => {
    const guide = createFirstMeetingGuide();
    guide.preparation = [];
    guide.roles = [];
    guide.steps = [];
    render(<GuideContent guide={guide} showResources={false} />);
    expect(screen.getByText("등록된 안내가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록된 역할이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록된 순서가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("면접 진행 참고").closest("details")).not.toHaveAttribute("open");
  });
});

describe("나눔마블 자료 다운로드", () => {
  it("자료실만 표시해도 다섯 다운로드의 이름·유형·크기가 제공된다", () => {
    render(<PraiseResourceLibrary />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    const deck = screen.getByRole("link", { name: "전체 운영안과 게임판 다운로드" });
    expect(deck).toHaveAttribute("download");
    expect(deck).toHaveAttribute("href", "/praise-resources/nanum-marble-kit.pptx");
    expect(screen.getByText("PPTX · 156 KB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3라운드 인쇄판 · 응원으로 깊게 다운로드" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "찬양팀 첫 모임 가이드" })).not.toBeInTheDocument();
  });
});
