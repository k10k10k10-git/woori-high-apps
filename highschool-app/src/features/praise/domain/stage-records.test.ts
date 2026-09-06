/** 원본: andew423-source/high-school-worship-team @ 982dc53ab3ee6d1261736167e5a000deec07974b. 변경 범위는 THIRD_PARTY.md 참조. */
import { test } from "vitest";
import assert from "node:assert/strict";
import { latestConfirmedVersions, stageRecordLabel } from "./stage-records";
test("history uses latest confirmation without counting previous versions twice", () => {
  const base = { plan_id: "p", leader_type: "STAFF", leader_term_student_id: null };
  assert.equal(latestConfirmedVersions([{...base,id:"new",version_no:4},{...base,id:"old",version_no:2}]).get("p")?.id,"new");
});
test("history separates leader, assigned roles, resting and unknown", () => {
  const base = { confirmed: true, leader: false, roles: [], eligible: false, excluded: false };
  assert.equal(stageRecordLabel(base),"기록 없음");
  assert.equal(stageRecordLabel({...base,confirmed:false,eligible:true}),"미확정");
  assert.equal(stageRecordLabel({...base,eligible:true}),"반에서 예배하기");
  assert.equal(stageRecordLabel({...base,excluded:true}),"반에서 예배하기");
  assert.equal(stageRecordLabel({...base,leader:true,eligible:true}),"인도자");
  assert.equal(stageRecordLabel({...base,roles:["1부 싱어"]}),"1부 싱어");
  assert.equal(stageRecordLabel({...base,roles:["2부 콰이어"]}),"2부 콰이어");
});
