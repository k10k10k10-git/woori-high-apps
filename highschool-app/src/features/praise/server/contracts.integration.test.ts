import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getDatabase, type Database } from "firebase-admin/database";
vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({ database: null as Database | null, auth: null as Auth | null }));
vi.mock("./firebaseAdmin", async importOriginal => ({ ...await importOriginal<typeof import("./firebaseAdmin")>(), getPraiseFirebaseAdmin:()=>({database:holder.database,auth:holder.auth}) }));
import { authenticatePraiseRequest } from "./httpAuth";
import { readWorkspace, transactWorkspace } from "./repository";
import { createPraiseState, applyPraiseCommand } from "./commands";
import type { PraiseActor, PraiseState } from "../types";
const admin: PraiseActor={uid:"test_admin",name:"합성 관리자",roles:{semester:"superAdmin",retreat:"none"}};
const enabled=process.env.PRAISE_CONTRACTS==="1";
const suite=enabled?describe:describe.skip;
let app:App;
const base="http://127.0.0.1:19016";
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
  app=initializeApp({projectId:"demo-praise",databaseURL:`${base}/?ns=demo-praise-default-rtdb`,credential:{getAccessToken:async()=>({access_token:"owner",expires_in:3600})}},"praise-contracts");holder.database=getDatabase(app);holder.auth=getAuth(app);
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
  const response=await fetch("http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"contract@example.test",password:"synthetic-password-123",returnSecureToken:true})});
  expect(response.ok).toBe(true);
  const account=await response.json() as {idToken:string;localId:string};
  const request=new Request("http://localhost/api/praise",{headers:{Authorization:`Bearer ${account.idToken}`}});
  await holder.database!.ref(`admins/${account.localId}`).set(true);
  expect((await authenticatePraiseRequest(request)).roles.semester).toBe("superAdmin");
  await holder.database!.ref(`admins/${account.localId}`).remove();
  expect((await authenticatePraiseRequest(request)).roles.semester).toBe("none");
  await holder.auth!.updateUser(account.localId,{disabled:true});
  await expect(authenticatePraiseRequest(request)).rejects.toMatchObject({status:401});
 });
 it("인증 형식이 틀린 요청과 실제 익명 토큰을 거절한다",async()=>{
  await expect(authenticatePraiseRequest(new Request("http://localhost/api/praise",{headers:{Authorization:"Bearer invalid"}}))).rejects.toMatchObject({status:401});
  const response=await fetch("http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({returnSecureToken:true})});
  expect(response.ok).toBe(true);
  const {idToken}=await response.json() as {idToken:string};
  await expect(authenticatePraiseRequest(new Request("http://localhost/api/praise",{headers:{Authorization:`Bearer ${idToken}`}}))).rejects.toMatchObject({status:401});
 });

});
