import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { praiseActivityRecord } from "./projection";
import type { PraiseAuditEvent } from "../types";
const event: PraiseAuditEvent = {id:"op_1",at:1_800_000_000_000,actor:{uid:"synthetic_user",name:"합성 사용자"},action:"attendance.set",label:"출결 변경",changes:[{field:"출결",before:"미입력",after:"출석"}]};

it("일괄 작업의 실제 대상 수를 상세 표시 제한과 별도로 보존한다",()=>{
  expect(praiseActivityRecord("synthetic-workspace", { ...event, changedCount: 41 })?.changedCount).toBe(41);
});
describe("찬양팀 감사 투영",()=>{
 it("작업별 고정 ID로 재전송 중복을 막고 기존 통합 로그 계약을 만족한다",()=>{
  const first=praiseActivityRecord("test_workspace",event);expect(first).not.toBeNull();expect(first?.id).toBe(praiseActivityRecord("test_workspace",event)?.id);
  expect(first?.id).not.toBe(praiseActivityRecord("other_workspace",event)?.id);expect(first?.target.href).toBe("/sunday-ministry/praise?workspace=test_workspace");expect(first?.actor.uid).toBe("synthetic_user");
 });
 it("과거 이관 기록을 오늘 사용자가 입력한 통합 로그로 만들지 않는다",()=>{expect(praiseActivityRecord("test_workspace",{...event,historical:true,sourceActorId:"old_uuid"})).toBeNull();});
 it("임의 원장 필드를 복제하지 않고 길이와 필드 수를 제한한다",()=>{
  const record=praiseActivityRecord("test_workspace",{...event,changes:Array.from({length:50},()=>({field:"a".repeat(200),after:"b".repeat(200)}))});
  expect(record?.changes).toHaveLength(40);expect(record?.changes[0].after).toHaveLength(160);expect(record?.changedCount).toBe(50);
 });
});
