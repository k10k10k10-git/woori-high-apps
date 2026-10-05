import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getDatabase, type Database } from "firebase-admin/database";
vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({ database: null as Database | null, auth: null as Auth | null, app: null as App | null }));
vi.mock("./firebaseAdmin", async importOriginal => ({ ...await importOriginal<typeof import("./firebaseAdmin")>(), getPraiseFirebaseAdmin:()=>({database:holder.database,auth:holder.auth,app:holder.app}) }));
import { GET as semesterIds } from "@/app/api/semester-ids/route";
import { authenticatePraiseRequest } from "./httpAuth";
import { readWorkspace, transactWorkspace } from "./repository";
import { createPraiseState, applyPraiseCommand } from "./commands";
import type { PraiseActor, PraiseState } from "../types";
const admin: PraiseActor={uid:"test_admin",name:"합성 관리자",roles:{semester:"superAdmin",retreat:"none"},teamMemberships:{}};
const enabled=process.env.PRAISE_CONTRACTS==="1";
const suite=enabled?describe:describe.skip;
let app:App;
const base="http://127.0.0.1:19016";
async function signup(email:string){
 const response=await fetch("http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:"synthetic-password-123",returnSecureToken:true})});
 expect(response.ok).toBe(true);return response.json() as Promise<{idToken:string;localId:string}>;
}
async function clientDb(path:string,token:string,method:"GET"|"PUT"="GET",body?:unknown){
 const url=new URL(`/${path}.json`,base);url.searchParams.set("ns","demo-praise-default-rtdb");url.searchParams.set("auth",token);
 return fetch(url,{method,...(method==="PUT"?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
}
function state(id:string):PraiseState {
 const value=createPraiseState({operationId:"create",workspace:{id,name:"합성 검증",startDate:"2026-09-05",endDate:"2026-09-05"}},admin,1800000000000);
 value.meta.mode="live";
 for(const id of ["student_a","student_b"])value.people[id]={id,kind:"STUDENT",name:"합성 "+id,grade:1,gender:"FEMALE",department:"FIRST",team:"SINGER",active:true,isStudentLeader:false,singerCapable:true,groupStaffCapable:false,preferredService:"BOTH",excludeFromAutoSinger:false,revision:1,updatedAt:1800000000000,updatedBy:admin.uid};
 value.groupVersions.group={id:"group",number:1,kind:"CONFIRMED",createdAt:1800000000000,createdBy:admin.uid,seed:1,settings:{...value.policy.grouping,groupCount:1},rules:[],groups:[{id:"g1",name:"합성 조",studentIds:Object.keys(value.people),staffIds:[]}],warnings:[],acknowledgedWarnings:true};
 value.meta.activeGroupVersionId="group";return value;
}
suite("실제 RTDB 직렬화·동시 저장·직접 Rules 접근",()=>{
 beforeAll(async()=>{
  if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=="127.0.0.1:19016" || process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:19098")throw new Error("합성 에뮬레이터 주소가 아닙니다.");
  app=initializeApp({projectId:"demo-praise",databaseURL:`${base}/?ns=demo-praise-default-rtdb`,credential:{getAccessToken:async()=>({access_token:"owner",expires_in:3600})}},"praise-contracts");holder.database=getDatabase(app);holder.auth=getAuth(app);holder.app=app;
  await holder.database.ref().set({admins:{test_admin:true}});
 });
 afterAll(async()=>{if(app)await deleteApp(app);});
 it("새 경로는 현행 Rules에서 익명·통합관리자 클라이언트 모두 직접 읽고 쓸 수 없다",async()=>{
  const unsigned=[{alg:"none",typ:"JWT"},{iss:"https://securetoken.google.com/demo-praise",aud:"demo-praise",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,sub:"test_admin",user_id:"test_admin",firebase:{sign_in_provider:"custom"}}].map(value=>Buffer.from(JSON.stringify(value)).toString("base64url")).join(".")+".";
  for(const token of [null,unsigned])for(const method of ["GET","PUT"]){
   const url=new URL("/praiseOps/contract.json",base);url.searchParams.set("ns","demo-praise-default-rtdb");if(token)url.searchParams.set("auth",token);
   const response=await fetch(url,{method,...(method==="PUT"?{body:JSON.stringify({blocked:true})}:{} )});expect(response.status).toBe(401);
  }
 });
 it("cold cache 생성과 빈 배열·null 미입력 왕복을 유지한다",async()=>{
  await transactWorkspace("roundtrip",()=>state("roundtrip"));
  await transactWorkspace("roundtrip",current=>applyPraiseCommand(current!,{type:"attendance.set",meetingId:"m_20260905",personId:"student_a",status:null,expectedRevision:0},admin,1800000000001,"null_cell"));
  const loaded=await readWorkspace("roundtrip");expect(loaded?.attendance.m_20260905.student_a.status).toBeNull();expect(loaded?.groupVersions.group.groups[0].staffIds).toEqual([]);expect(loaded?.policy.rules).toEqual([]);expect(loaded?.audit.null_cell.changes).toHaveLength(1);
 });
 it("서로 다른 학생 동시 저장은 둘 다 보존하고 같은 셀의 오래된 버전은 거절한다",async()=>{
  await transactWorkspace("concurrency",()=>state("concurrency"));
  const write=(personId:string,operationId:string)=>transactWorkspace("concurrency",current=>applyPraiseCommand(current!,{type:"attendance.set",meetingId:"m_20260905",personId,status:"PRESENT",expectedRevision:0},admin,1800000000002,operationId));
  const separate=await Promise.all([write("student_a","a"),write("student_b","b")]);expect(separate).toHaveLength(2);
  const loaded=await readWorkspace("concurrency");expect(Object.keys(loaded!.attendance.m_20260905)).toHaveLength(2);expect(loaded?.audit.a).toBeDefined();expect(loaded?.audit.b).toBeDefined();
  await expect(write("student_a","stale")).rejects.toMatchObject({status:409});
  await write("student_a","a");expect(Object.keys((await readWorkspace("concurrency"))!.audit)).toHaveLength(3);
 });
 it("실제 Auth 토큰과 최신 역할 원장을 대조하고 권한 회수를 반영한다",async()=>{
  const account=await signup("contract@example.test");
  const request=new Request("http://localhost/api/praise",{headers:{Authorization:`Bearer ${account.idToken}`}});
  await holder.database!.ref(`admins/${account.localId}`).set(true);
  expect((await authenticatePraiseRequest(request)).roles.semester).toBe("superAdmin");
  await holder.database!.ref(`admins/${account.localId}`).remove();
  expect((await authenticatePraiseRequest(request)).roles.semester).toBe("none");
  await holder.auth!.updateUser(account.localId,{disabled:true});
  await expect(authenticatePraiseRequest(request)).rejects.toMatchObject({status:401});
 });
 it("담당 팀 쓰기와 학기 공용·비공개 쓰기를 실제 Rules에서 분리한다",async()=>{
  await holder.database!.ref("semesters/team-contract").set({
   meta:{title:"합성 학기"},
   teams:{media:{name:"미디어팀",teamKey:"media"},praise:{name:"찬양팀",teamKey:"praise"}},
   applications:{mediaStudent:{name:"미디어 학생",teamId:"media"},praiseStudent:{name:"찬양 학생",teamId:"praise"}},
  });
  await holder.database!.ref("semesters/other-contract").set({
   meta:{title:"다른 학기"},teams:{media:{name:"미디어팀",teamKey:"media"}},applications:{mediaStudent:{name:"미디어 학생",teamId:"media"}},
  });
  const media=await signup("media-contract@example.test");
  await holder.database!.ref(`retreatAdmins/${media.localId}`).set({email:"media-contract@example.test",role:"leader",semesterRole:"leader",retreatRole:"none",teamMemberships:{media:{role:"leader",active:true,semesters:{"team-contract":true}}}});
  expect((await clientDb("semesters/team-contract/teams/media/goal",media.idToken,"PUT","담당 목표")).ok).toBe(true);
  expect((await clientDb("semesters/team-contract/curriculum/media/session-1",media.idToken,"PUT",{plan:"담당 계획"})).ok).toBe(true);
  expect((await clientDb("semesters/team-contract/attendance/team/session-1/mediaStudent",media.idToken,"PUT",{s:"출석"})).ok).toBe(true);
  expect((await clientDb("semesters/team-contract/teams/praise/goal",media.idToken,"PUT","다른 팀 목표")).ok).toBe(false);
  expect((await clientDb("semesters/team-contract/attendance/team/session-1/praiseStudent",media.idToken,"PUT",{s:"출석"})).ok).toBe(false);
  expect((await clientDb("semesters/team-contract/archiveLinks/link-1",media.idToken,"PUT",{title:"공용 자료"})).ok).toBe(false);
  expect((await clientDb("semesters/other-contract/teams/media/goal",media.idToken,"PUT","범위 밖 목표")).ok).toBe(false);
  expect((await clientDb("semestersPrivate/team-contract/applicationsPrivate/mediaStudent",media.idToken)).ok).toBe(false);

  const viewer=await signup("viewer-contract@example.test");
  await holder.database!.ref(`iguardMembers/${viewer.localId}`).set({email:"viewer-contract@example.test",semesterRole:"staff",teamMemberships:{media:{role:"viewer",active:true}}});
  expect((await clientDb("semesters/team-contract/teams/media/goal",viewer.idToken,"PUT","조회자 변경")).ok).toBe(false);

  const central=await signup("central-contract@example.test");
  await holder.database!.ref(`retreatAdmins/${central.localId}`).set({email:"central-contract@example.test",role:"adminTeam",semesterRole:"adminTeam",retreatRole:"none"});
  expect((await clientDb("semesters/team-contract/meta/title",central.idToken,"PUT","중앙 수정")).ok).toBe(true);
  expect((await clientDb("semestersPrivate/team-contract/applicationsPrivate/mediaStudent",central.idToken,"PUT",{phone:"010-0000-0000"})).ok).toBe(true);

  const platform=await signup("platform-contract@example.test");
  await holder.database!.ref(`retreatAdmins/${platform.localId}`).set({email:"platform-contract@example.test",role:"superAdmin",semesterRole:"superAdmin",retreatRole:"none"});
  expect((await clientDb("semesters/team-contract/meta/title",platform.idToken,"PUT","통합관리자 수정")).ok).toBe(true);
  expect((await clientDb("semestersPrivate/team-contract/applicationsPrivate/mediaStudent",platform.idToken)).ok).toBe(true);
 });
 it("바나바팀은 새친구 원장만 수정하고 다른 지원자 개인정보에는 접근하지 못한다",async()=>{
  const barnabas=await signup("barnabas-contract@example.test");
  await holder.database!.ref(`iguardMembers/${barnabas.localId}`).set({email:"barnabas-contract@example.test",semesterRole:"staff",teamMemberships:{barnabas:{role:"leader",active:true}}});
  expect((await clientDb("semesters/team-contract/newFriends/friend-1",barnabas.idToken,"PUT",{name:"합성 새친구"})).ok).toBe(true);
  expect((await clientDb("semestersPrivate/team-contract/newFriendsPrivate/friend-1",barnabas.idToken,"PUT",{phone:"010-0000-0000"})).ok).toBe(true);
  expect((await clientDb("semestersPrivate/team-contract/applicationsPrivate/mediaStudent",barnabas.idToken)).ok).toBe(false);
 });
 it("인증 형식이 틀린 요청과 실제 익명 토큰을 거절한다",async()=>{
  await expect(authenticatePraiseRequest(new Request("http://localhost/api/praise",{headers:{Authorization:"Bearer invalid"}}))).rejects.toMatchObject({status:401});
  const response=await fetch("http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})});
  expect(response.ok).toBe(true);
  const {idToken}=await response.json() as {idToken:string};
  await expect(authenticatePraiseRequest(new Request("http://localhost/api/praise",{headers:{Authorization:`Bearer ${idToken}`}}))).rejects.toMatchObject({status:401});
 });

 it("실제 인증·shallow 탐색·하위 읽기와 미승인·회수 계정 거부를 확인한다",async()=>{
  const member=await signup("semester-list@example.test");
  const request=new Request("http://localhost/api/semester-ids",{headers:{Authorization:`Bearer ${member.idToken}`}});
  expect((await semesterIds(request)).status).toBe(403);
  await holder.database!.ref(`iguardMembers/${member.localId}`).set({semesterRole:"staff",retreatRole:"none"});
  const response=await semesterIds(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ids:expect.arrayContaining(["team-contract","other-contract"])});
  expect((await clientDb("semesters/team-contract/meta",member.idToken)).ok).toBe(true);
  expect((await clientDb("semesters/team-contract/sessions",member.idToken)).ok).toBe(true);
  await holder.database!.ref(`iguardMembers/${member.localId}`).remove();
  expect((await semesterIds(request)).status).toBe(403);
  expect((await semesterIds(new Request("http://localhost/api/semester-ids"))).status).toBe(401);
 });

});
