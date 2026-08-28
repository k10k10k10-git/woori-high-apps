// Firebase 접근 레이어 배럴 — 기존 import 경로(@/lib/db)를 유지하기 위한 재수출.
// 함수 본문은 db/ 하위 도메인 모듈에 있다 (2026-07 리팩토링 R5, 본문 무변경 이동).
export { subscribeToConnection } from "./db/core";
export * from "./db/retreats";
export * from "./db/participants";
export * from "./db/groupsRooms";
export * from "./db/autoAssignConfig";
export * from "./db/roomAutoAssignConfig";
export * from "./db/students";
export * from "./db/teachers";
export * from "./db/access";
export * from "./db/retreatOps";
export * from "./db/private";
export * from "./db/shared";
export * from "./db/programs";
