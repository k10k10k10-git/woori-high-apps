/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { PraiseGroupBoard } from "./PraiseGroupBoard";
import { PraiseStageBoard } from "./PraiseStageBoard";
import { PraiseStageAvailability } from "./PraiseStageAvailability";
import { praiseFixture } from "./praiseTestFixtures";
import type { StageAssignment } from "../domain/stage";
afterEach(cleanup);
it("조 담당 플래그가 꺼져 있어도 활동 스탭을 수동 배정하며 카드 이동을 제공한다", () => {
  const v = praiseFixture();
  v.people[3].groupStaffCapable = false;
  const onMove = vi.fn();
  render(
    <PraiseGroupBoard
      groups={v.groups[0].groups}
      people={v.people}
      maximum={7}
      canEdit
      onMove={onMove}
      onRename={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("합성가조 담당 스탭 선택"), {
    target: { value: "staff-2" },
  });
  expect(onMove).toHaveBeenCalledWith("staff-2", "group-a", "staffIds");
  fireEvent.change(screen.getByLabelText("합성학생가 카드에서 조 이동"), {
    target: { value: "group-b" },
  });
  expect(onMove).toHaveBeenCalledWith("student-1", "group-b", "studentIds");
});
it("출석 후보를 무대에 올리고 다시 미등단으로 이동한다", () => {
  const v = praiseFixture();
  v.attendance["meeting-1"] = {
    "student-1": {
      status: "PRESENT",
      revision: 1,
      updatedAt: 1,
      updatedBy: "tester",
      groupVersionId: "groups-1",
    },
  };
  function Demo() {
    const [assignments, set] = useState<StageAssignment[]>([]);
    return (
      <PraiseStageBoard
        view={v}
        meeting={v.meetings[0]}
        config={{
          ...v.policy!.stage,
          leaderType: "STAFF",
          leaderId: "staff-1",
          staffOnly: false,
        }}
        overrides={[]}
        service={{ department: "FIRST", assignments }}
        leaderName="합성스탭가"
        canEdit
        onChange={set}
      />
    );
  }
  render(<Demo />);
  fireEvent.change(screen.getByLabelText("1부 합성학생가 무대 위치"), {
    target: { value: "CHOIR:RIGHT" },
  });
  expect(screen.getByLabelText("1부 합성학생가 무대 위치")).toHaveValue(
    "CHOIR:RIGHT",
  );
  fireEvent.change(screen.getByLabelText("1부 합성학생가 무대 위치"), {
    target: { value: "off" },
  });
  expect(screen.getByLabelText("1부 합성학생가 무대 위치")).toHaveValue("off");
  expect(screen.getByLabelText("1부 합성학생나 무대 위치")).toBeDisabled();
});
it("스탭 참석은 조회시 저장하지 않고 명시 클릭과 revision으로만 기록한다", () => {
  const v = praiseFixture();
  const execute = vi.fn();
  render(
    <PraiseStageAvailability
      view={v}
      meeting={v.meetings[0]}
      busy={false}
      execute={execute}
    />,
  );
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getAllByRole("button", { name: "참석", hidden: true })[0],
  );
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "availability.set",
      present: true,
      expectedRevision: 0,
      personId: "staff-1",
    }),
  );
});
