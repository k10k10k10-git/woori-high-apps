import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { rosterCandidate, verifiedRosterCandidate } from "./roster";
import type { Application } from "@/features/semester/types";
const student:Application={id:"1_test",studentId:"test",personId:"person_student_test",bu:"1부",grade:1,class:2,name:"합성 학생",trainingClassId:"training",choice1:"praise",status:"배치",teamId:"praise",createdAt:"2026-09-06"};
describe("찬양팀 정식 원장 연결",()=>{
 it("이름 대신 검증한 신청키와 안정 인물키를 연결한다",()=>{expect(rosterCandidate("1_test",student,"2026-2","praise")?.rosterLink).toEqual({applicationKey:"1_test",personId:"person_student_test",year:"2026",studentId:"test",classKey:"1-1-2"});expect(rosterCandidate("same_name_other_id",student,"2026-2","praise")).toBeNull();});
 it("다른 팀·취소·미배치·훈련전용·훈련미신청을 가져오지 않는다",()=>{
  for(const patch of [{teamId:"media"},{status:"취소"},{status:"접수"},{trainingOnly:true},{trainingClassId:undefined},{class:"1/secret"},{class:0}])expect(rosterCandidate("1_test",{...student,...patch} as Application,"2026-2","praise")).toBeNull();
 });
 it("고3 2학기와 정식 스탭 예외만 기존 계약대로 허용한다",()=>{
  expect(rosterCandidate("1_test",{...student,grade:3,trainingClassId:undefined},"2026-2","praise")).not.toBeNull();
  expect(rosterCandidate("1_test",{...student,grade:3,trainingClassId:undefined},"2026-1","praise")).toBeNull();
  expect(rosterCandidate("s_test",{...student,personId:"person_staff_test",bu:"스탭",grade:0,trainingClassId:undefined},"2026-1","praise")?.rosterLink.staffId).toBe("test");
 });
 it("신청과 공식 원장의 같은 안정 인물키를 확인하고 공식 이름을 사용한다",()=>{
  const result=verifiedRosterCandidate("1_test",student,"2026-2","praise",{name:"합성 학생 최신",personId:"person_student_test"});
  expect(result).toMatchObject({name:"합성 학생 최신",rosterLink:{personId:"person_student_test",studentId:"test",classKey:"1-1-2"}});
 });
 it("공식 원장 누락·안정 인물키 누락·구분 위조·키 불일치를 연결 후보에서 제외한다",()=>{
  expect(verifiedRosterCandidate("1_test",student,"2026-2","praise",null)).toBeNull();
  expect(verifiedRosterCandidate("1_test",{...student,personId:undefined},"2026-2","praise",{name:student.name,personId:"person_student_test"})).toBeNull();
  expect(verifiedRosterCandidate("1_test",student,"2026-2","praise",{name:student.name})).toBeNull();
  expect(verifiedRosterCandidate("1_test",{...student,personId:"person_staff_test"},"2026-2","praise",{name:student.name,personId:"person_staff_test"})).toBeNull();
  expect(verifiedRosterCandidate("1_test",student,"2026-2","praise",{name:student.name,personId:"person_student_other"})).toBeNull();
  expect(verifiedRosterCandidate("1_test",student,"2026-2","praise",{name:17 as unknown as string,personId:"person_student_test"})).toBeNull();
  expect(verifiedRosterCandidate("1_test",student,"2026-2","praise",{name:student.name,personId:"person_student/bad"})).toBeNull();
 });
 it("손상된 신청 행은 정상 후보까지 막지 않고 그 행만 제외한다",()=>{
  const rows = [
    ["1_test", student],
    ["1_broken", { ...student, studentId: "broken/path", personId: "person_student_broken" }],
    ["1_bad-class", { ...student, studentId: "bad-class", personId: "person_student_bad_class", class: "1/secret" }],
  ] as Array<[string, Application]>;
  expect(rows.flatMap(([key, value]) => rosterCandidate(key, value, "2026-2", "praise") ?? [])).toHaveLength(1);
 });
 it("접수 원문의 임의 민감 필드를 응답에 복제하지 않는다",()=>{const result=rosterCandidate("1_test",{...student,phone:"secret"} as Application,"2026-2","praise");expect(JSON.stringify(result)).not.toContain("secret");});
});
