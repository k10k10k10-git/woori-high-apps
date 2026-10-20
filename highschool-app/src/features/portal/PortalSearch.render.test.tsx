/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "./accessPolicy";
import type { subscribePeopleSearchData } from "./peopleSearchDb";

const state = vi.hoisted(() => ({
  auth: {
    roles: { semester: "leader", retreat: "none" } as MinistryRoles,
    canSearchOfficialRoster: true,
  },
  subscribe: vi.fn<typeof subscribePeopleSearchData>(() => vi.fn()),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("./peopleSearchDb", () => ({ subscribePeopleSearchData: state.subscribe }));

import PortalSearch from "./PortalSearch";

beforeEach(() => {
  state.auth.roles = { semester: "leader", retreat: "none" };
  state.auth.canSearchOfficialRoster = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("인물 통합검색 권한", () => {
  it("운영센터 팀장과 교역자·행정팀은 검색할 수 있다", () => {
    for (const semester of ["leader", "pastor", "adminTeam"] as const) {
      state.auth.roles = { semester, retreat: "none" };
      const view = render(<PortalSearch />);
      fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
      expect(state.subscribe).toHaveBeenCalledTimes(1);
      view.unmount();
      vi.clearAllMocks();
    }
  });

  it("팀 연결된 팀장은 연간 원장 검색을 열지 않는다", () => {
    state.auth.canSearchOfficialRoster = false;
    render(<PortalSearch />);
    expect(screen.queryByRole("button", { name: "인물 통합검색 열기" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(state.subscribe).not.toHaveBeenCalled();
  });

  it("검색 중 팀 연결이 생기면 구독을 해제하고 검색창을 닫는다", () => {
    const unsubscribe = vi.fn();
    state.subscribe.mockReturnValue(unsubscribe);
    const view = render(<PortalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.auth.canSearchOfficialRoster = false;
    view.rerender(<PortalSearch />);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "인물 통합검색" })).not.toBeInTheDocument();
  });
});

describe("인물 통합검색 기록 표시", () => {
  it("같은 영구 ID로 연결한 기록은 최신 학적과 최신 연도 탭부터 표시한다", () => {
    state.subscribe.mockImplementationOnce((_options, callback) => {
      callback({
        classes: {
          2025: { "1-1-4": { students: { old: { name: "가상학생", personId: "person_student_fixed" } } } },
          2026: { "1-2-6": { students: { current: { name: "가상학생", personId: "person_student_fixed", birth: "2010-01-02" } } } },
        },
        attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
      });
      return vi.fn();
    });
    render(<PortalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "인물 이름" }), { target: { value: "가상학생" } });
    expect(screen.getByText(/2026년 2학년 6반/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /가상학생 학생/ }));

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["2026년1건", "2025년1건"]);
    expect(screen.getByRole("tab", { name: "2026년 1건" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "2026년 기록" })).toHaveTextContent("2학년 6반");
    fireEvent.click(screen.getByRole("tab", { name: "2025년 1건" }));
    expect(screen.getByRole("tabpanel", { name: "2025년 기록" })).toHaveTextContent("1학년 4반");
  });

  it("분리된 검색 결과와 상세에서 동일인 확인이 필요함을 표시한다", () => {
    state.subscribe.mockImplementationOnce((_options, callback) => {
      callback({
        classes: {
          2025: { "1-1-4": { students: { old: { name: "가상학생", personId: "person_student_old", phone: "010-0000-1234" } } } },
          2026: { "1-2-6": { students: { current: { name: "가상학생", personId: "person_student_current", birth: "2010-01-02", phone: "010-0000-1234" } } } },
        },
        attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
      });
      return vi.fn();
    });
    render(<PortalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "인물 이름" }), { target: { value: "가상학생" } });

    expect(screen.getAllByText("동일인 확인 필요")).toHaveLength(2);
    expect(screen.getByText(/같은 사람의 기록도 따로 표시될 수 있습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/동명이인/)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /가상학생 학생 동일인 확인 필요/ })[0]);

    expect(screen.getByText("동일인 확인 필요")).toBeInTheDocument();
    expect(screen.getByText(/학년·반과 연락처를 대조해 동일인 여부를 확인해 주세요/)).toBeInTheDocument();
    expect(screen.queryByText(/별도 인물로 나눴습니다/)).not.toBeInTheDocument();
  });
});
