import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { rosterCandidate } from "./roster";
import type { Application } from "@/features/semester/types";
const student:Application={id:"1_test",studentId:"test",personId:"stable",bu:"1부",grade:1,class:2,name:"합성 학생",trainingClassId:"training",choice1:"praise",status:"배치",teamId:"praise",createdAt:"2026-09-06"};
describe("찬양팀 정식 원장 연결",()=>{
 it("이름 대신 검증한 신청키와 안정 인물키를 연결한다",()=>{expect(rosterCandidate("1_test",student,"2026-2","praise")?.rosterLink).toEqual({applicationKey:"1_test",personId:"stable",year:"2026",studentId:"test",classKey:"1-1-2"});expect(rosterCandidate("same_name_other_id",student,"2026-2","praise")).toBeNull();});
 it("다른 팀·취소·미배치·훈련전용·훈련미신청을 가져오지 않는다",()=>{
  for(const patch of [{teamId:"media"},{status:"취소"},{status:"접수"},{trainingOnly:true},{trainingClassId:undefined}])expect(rosterCandidate("1_test",{...student,...patch} as Application,"2026-2","praise")).toBeNull();
 });
 it("고3 2학기와 정식 스탭 예외만 기존 계약대로 허용한다",()=>{
  expect(rosterCandidate("1_test",{...student,grade:3,trainingClassId:undefined},"2026-2","praise")).not.toBeNull();
  expect(rosterCandidate("1_test",{...student,grade:3,trainingClassId:undefined},"2026-1","praise")).toBeNull();
  expect(rosterCandidate("s_test",{...student,bu:"스탭",grade:0,trainingClassId:undefined},"2026-1","praise")?.rosterLink.staffId).toBe("test");
 });
 it("접수 원문의 임의 민감 필드를 응답에 복제하지 않는다",()=>{const result=rosterCandidate("1_test",{...student,phone:"secret"} as Application,"2026-2","praise");expect(JSON.stringify(result)).not.toContain("secret");});
});
