/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/features/semester/types";

vi.mock("@/lib/firebase", () => ({ auth: {}, db: {}, storage: {} }));

import { TrainingRoster } from "./TrainingTermWorkspace";

afterEach(cleanup);

const person: Application = {
  id: "app-1", studentId: "student-1", bu: "1부", grade: 2, class: 2,
  name: "가상 학생", trainingClassId: "training-2", teamId: "team-1",
  status: "배치", createdAt: "2026-09-01",
};

const base = {
  roster: [person],
  classById: new Map([["training-2", { id: "training-2", name: "2학년 훈련", color: "", order: 1 }]]),
  teamById: new Map([["team-1", { id: "team-1", name: "찬양팀", color: "", order: 1 }]]),
  privates: { "app-1": { phone: "010-0000-0000" } },
  rosterContacts: {},
};

describe("훈련 명단 모바일 카드", () => {
  it("비공개 연락처 권한이 없으면 카드와 표 모두에서 연락처가 빠진다", () => {
    render(<TrainingRoster {...base} showContacts={false} />);
    expect(screen.getAllByText("가상 학생")).toHaveLength(2);
    expect(screen.queryByText("010-0000-0000")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "010-0000-0000" })).not.toBeInTheDocument();
  });

  it("권한이 있으면 카드에서 이름·훈련반·사역팀·전화 링크를 함께 보여준다", () => {
    render(<TrainingRoster {...base} showContacts />);
    const card = document.querySelector(".training-roster-card");
    expect(card).toHaveTextContent("가상 학생");
    expect(card).toHaveTextContent("2학년 훈련");
    expect(card).toHaveTextContent("찬양팀");
    expect(card?.querySelector('a[href="tel:010-0000-0000"]')).toBeTruthy();
  });
});
