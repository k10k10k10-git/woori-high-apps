"use client";
import { useEffect, useMemo, useState } from "react";
import {
  subscribeToRetreat, subscribeToStudentsByYear, subscribeToGroups, subscribeToRooms,
  subscribeToIguardMeals, subscribeToIguardSchedule,
  subscribeToIguardSegments, subscribeToIguardPosts, subscribeToIguardMovements, subscribeToIguardBuses,
  subscribeToIguardSeating, subscribeToMilestones, subscribeToIguardGuide,
  subscribeToRetreatPeriods, subscribeToIguardAttendance, subscribeToPartialAttendances,
  subscribeToTeacherAttendances, subscribeToIguardGroupStaff, subscribeToCellColors,
  subscribeToConnection, subscribeToParticipants, subscribeToIguardGbs,
  subscribeToIguardLodgingMaps,
} from "@/features/iguard/lib/db";
import {
  Retreat, Group, Room, Student, IguardMeal, IguardScheduleBlock,
  IguardSegment, IguardPost, IguardMovement, AssignedIguardMovement, IguardBus, IguardSeating, Milestone, RetreatPeriod,
  TeacherAttendance, IguardAttendanceInfo, PartialAttendanceMap, Participant,
  IguardGbsPlace,
  IguardLodgingMap,
} from "@/features/iguard/lib/types";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { movementsForDefaultSegments } from "@/features/iguard/lib/defaultSegment";
import { createSubscriptionReadinessGate } from "@/lib/subscriptionReadiness";

export interface RetreatData {
  retreat: Retreat | null;
  retreatLoading: boolean;
  dataLoading: boolean;
  loadError: string | null;
  groups: Group[];
  rooms: Room[];
  students: Record<string, Student>;
  participants: Record<string, Participant>;
  adminTeachers: TeacherAttendance[];
  meals: IguardMeal[];
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  posts: IguardPost[];
  /** 구간 UI 전환 전 기존 화면용: 레거시 + 기본 구간의 지정 완료 동선만. */
  movements: AssignedIguardMovement[];
  /** 새 모델 전체 레코드: 비기본 구간·담당 미정 슬롯 포함. */
  movementRecords: IguardMovement[];
  buses: IguardBus[];
  seating: IguardSeating[];
  todos: Milestone[];
  guide: string[];
  periods: RetreatPeriod[];
  attendanceKeys: Set<string>;
  attendanceInfo: Record<string, IguardAttendanceInfo>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  groupStaff: Record<string, string[]>;
  gbs: Record<string, IguardGbsPlace>;
  lodgingMaps: IguardLodgingMap[];
  connected: boolean;
}

/**
 * 수련회 데이터 허브 — 모든 Firebase 실시간 구독을 중앙 관리.
 * IguardClient에서 추출한 17개 구독 로직.
 */
export function useRetreatData(id: string): RetreatData {
  const [retreat, setRetreat] = useState<Retreat | null>(null);
  const [retreatLoading, setRetreatLoading] = useState(true);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  // 21개 구독의 실패를 경로별로 모은다 — 하나로 합치면 첫 실패만 보여 원인을 잘못 짚는다
  // (2026-08-08 학기·홈에서 실제로 두 번 오진했다). scope가 id라 수련회를 옮기면 초기화된다.
  const { fail: failPath, ok: okPath, message: loadError } = useLoadErrors(id);

  const [groups, setGroups] = useState<Group[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [adminTeachers, setAdminTeachers] = useState<TeacherAttendance[]>([]);
  const [meals, setMeals] = useState<IguardMeal[]>([]);
  const [schedule, setSchedule] = useState<IguardScheduleBlock[]>([]);
  const [segments, setSegments] = useState<IguardSegment[]>([]);
  const [posts, setPosts] = useState<IguardPost[]>([]);
  const [movementRecords, setMovementRecords] = useState<IguardMovement[]>([]);
  const [buses, setBuses] = useState<IguardBus[]>([]);
  const [seating, setSeating] = useState<IguardSeating[]>([]);
  const [todos, setTodos] = useState<Milestone[]>([]);
  const [guide, setGuide] = useState<string[]>([]);
  const [periods, setPeriods] = useState<RetreatPeriod[]>([]);
  const [attendanceKeys, setAttendanceKeys] = useState<Set<string>>(new Set());
  const [attendanceInfo, setAttendanceInfo] = useState<Record<string, IguardAttendanceInfo>>({});
  const [partial, setPartial] = useState<PartialAttendanceMap>({});
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [groupStaff, setGroupStaff] = useState<Record<string, string[]>>({});
  const [gbs, setGbs] = useState<Record<string, IguardGbsPlace>>({});
  const [lodgingMaps, setLodgingMaps] = useState<IguardLodgingMap[]>([]);
  const [connected, setConnected] = useState(true);
  const movements = useMemo(
    () => movementsForDefaultSegments(segments, movementRecords),
    [segments, movementRecords],
  );

  // 수련회 메타 구독
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRetreat(id,
      r => { setRetreat(r); okPath("수련회 정보"); setRetreatLoading(false); },
      e => { failPath("수련회 정보")(e); setRetreatLoading(false); });
    return unsub;
  }, [id, failPath, okPath]);

  // 연결 상태 구독 — 수련회와 무관한 앱 전역 상태라 별도 useEffect
  useEffect(() => subscribeToConnection(
    value => { setConnected(value); okPath("연결 상태"); },
    failPath("연결 상태"),
  ), [failPath, okPath]);

  // 데이터 구독은 id·연도에만 의존 — 메타(이름/날짜) 실시간 변경 시 재구독하지 않도록
  const retreatYear = retreat?.year;
  const dataScope = retreatYear == null ? null : `${id}:${retreatYear}`;
  const dataLoading = dataScope == null || loadedScope !== dataScope;
  useEffect(() => {
    if (!id || retreatYear == null) return;
    const scope = `${id}:${retreatYear}`;
    let alive = true;
    const readiness = createSubscriptionReadinessGate([
      "students", "participants", "adminTeachers", "groups", "rooms", "meals", "schedule", "segments", "posts",
      "movements", "buses", "seating", "todos", "guide", "periods", "attendance", "partial", "cellColors", "groupStaff", "gbs", "lodgingMaps",
    ], () => { if (alive) setLoadedScope(scope); });
    // 성공하면 그 경로의 이전 실패를 지운다 — 권한이 열린 뒤 재구독하면 배너가 사라진다.
    const ready = (key: string) => {
      if (alive) okPath(key);
      readiness.markReady(key);
    };
    // 구독 에러(권한 거부·규칙 변경 등) 시: 실패한 경로를 배너에 모으고 해당 키를 ready 처리해
    // dataLoading이 영원히 true로 남는 "무한 스피너"를 방지한다.
    const fail = (key: string) => (error: Error) => {
      if (alive) failPath(key)(error);
      readiness.markReady(key);
    };
    const unsubs = [
      subscribeToStudentsByYear(retreatYear, value => { setStudents(value); ready("students"); }, fail("students")),
      subscribeToParticipants(id, value => { setParticipants(value); ready("participants"); }, fail("participants")),
      subscribeToTeacherAttendances(id, value => { setAdminTeachers(value); ready("adminTeachers"); }, fail("adminTeachers")),
      subscribeToGroups(id, value => { setGroups(value); ready("groups"); }, fail("groups")),
      subscribeToRooms(id, value => { setRooms(value); ready("rooms"); }, fail("rooms")),
      subscribeToIguardMeals(id, value => { setMeals(value); ready("meals"); }, fail("meals")),
      subscribeToIguardSchedule(id, value => { setSchedule(value); ready("schedule"); }, fail("schedule")),
      subscribeToIguardSegments(id, value => { setSegments(value); ready("segments"); }, fail("segments")),
      subscribeToIguardPosts(id, value => { setPosts(value); ready("posts"); }, fail("posts")),
      subscribeToIguardMovements(id, value => { setMovementRecords(value); ready("movements"); }, fail("movements")),
      subscribeToIguardBuses(id, value => { setBuses(value); ready("buses"); }, fail("buses")),
      subscribeToIguardSeating(id, value => { setSeating(value); ready("seating"); }, fail("seating")),
      subscribeToMilestones(value => { setTodos(value); ready("todos"); }, fail("todos")),
      subscribeToIguardGuide(id, value => { setGuide(value); ready("guide"); }, fail("guide")),
      subscribeToRetreatPeriods(id, value => { setPeriods(value); ready("periods"); }, fail("periods")),
      subscribeToIguardAttendance(id, (value, info) => { setAttendanceKeys(value); setAttendanceInfo(info); ready("attendance"); }, fail("attendance")),
      subscribeToPartialAttendances(id, value => { setPartial(value); ready("partial"); }, fail("partial")),
      subscribeToCellColors(id, value => { setCellColors(value); ready("cellColors"); }, fail("cellColors")),
      subscribeToIguardGroupStaff(id, value => { setGroupStaff(value); ready("groupStaff"); }, fail("groupStaff")),
      subscribeToIguardGbs(id, value => { setGbs(value); ready("gbs"); }, fail("gbs")),
      subscribeToIguardLodgingMaps(id, value => { setLodgingMaps(value); ready("lodgingMaps"); }, fail("lodgingMaps")),
    ];
    return () => {
      alive = false;
      unsubs.forEach(u => u());
    };
  }, [id, retreatYear, failPath, okPath]);

  return {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, segments, posts, movements, movementRecords, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff, gbs, lodgingMaps,
    connected,
  };
}
