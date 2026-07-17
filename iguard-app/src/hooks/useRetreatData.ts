"use client";
import { useEffect, useState } from "react";
import {
  subscribeToRetreat, subscribeToStudentsByYear, subscribeToGroups, subscribeToRooms,
  subscribeToIguardMeals, subscribeToIguardSchedule,
  subscribeToIguardPosts, subscribeToIguardMovements, subscribeToIguardBuses,
  subscribeToIguardSeating, subscribeToMilestones, subscribeToIguardGuide,
  subscribeToRetreatPeriods, subscribeToIguardAttendance, subscribeToPartialAttendances,
  subscribeToTeacherAttendances, subscribeToIguardGroupStaff, subscribeToCellColors,
  subscribeToConnection, subscribeToParticipants,
} from "@/lib/db";
import {
  Retreat, Group, Room, Student, IguardMeal, IguardScheduleBlock,
  IguardPost, IguardMovement, IguardBus, IguardSeating, Milestone, RetreatPeriod,
  TeacherAttendance, IguardAttendanceInfo, PartialAttendanceMap, Participant,
} from "@/lib/types";

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
  posts: IguardPost[];
  movements: IguardMovement[];
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
  connected: boolean;
}

/**
 * 수련회 데이터 허브 — 모든 Firebase 실시간 구독을 중앙 관리.
 * IguardClient에서 추출한 17개 구독 로직.
 */
export function useRetreatData(id: string): RetreatData {
  const [retreat, setRetreat] = useState<Retreat | null>(null);
  const [retreatLoading, setRetreatLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [adminTeachers, setAdminTeachers] = useState<TeacherAttendance[]>([]);
  const [meals, setMeals] = useState<IguardMeal[]>([]);
  const [schedule, setSchedule] = useState<IguardScheduleBlock[]>([]);
  const [posts, setPosts] = useState<IguardPost[]>([]);
  const [movements, setMovements] = useState<IguardMovement[]>([]);
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
  const [connected, setConnected] = useState(true);

  // 수련회 메타 구독
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRetreat(id,
      r => { setRetreat(r); setRetreatLoading(false); },
      e => { setLoadError(prev => prev ?? `retreat 구독 실패 — ${e.message}`); setRetreatLoading(false); });
    return unsub;
  }, [id]);

  // 연결 상태 구독 — 수련회와 무관한 앱 전역 상태라 별도 useEffect
  useEffect(() => subscribeToConnection(setConnected), []);

  // 데이터 구독은 id·연도에만 의존 — 메타(이름/날짜) 실시간 변경 시 재구독하지 않도록
  const retreatYear = retreat?.year;
  useEffect(() => {
    if (!id || retreatYear == null) return;
    setLoadError(null);
    setDataLoading(true);
    let alive = true;
    const pending = new Set([
      "students", "participants", "adminTeachers", "groups", "rooms", "meals", "schedule", "posts",
      "movements", "buses", "seating", "todos", "guide", "periods", "attendance", "partial", "cellColors", "groupStaff",
    ]);
    const ready = (key: string) => {
      pending.delete(key);
      if (alive && pending.size === 0) setDataLoading(false);
    };
    // 구독 에러(권한 거부·규칙 변경 등) 시: 에러 배너를 띄우고 해당 키를 ready 처리해
    // dataLoading이 영원히 true로 남는 "무한 스피너"를 방지한다.
    // (이 전파가 없던 시절엔 loadError가 선언만 되고 설정되는 곳이 없었다.)
    const fail = (key: string) => (error: Error) => {
      if (alive) setLoadError(prev => prev ?? `${key} 구독 실패 — ${error.message}`);
      ready(key);
    };
    const unsubs = [
      subscribeToStudentsByYear(retreatYear, value => { setStudents(value); ready("students"); }, fail("students")),
      subscribeToParticipants(id, value => { setParticipants(value); ready("participants"); }, fail("participants")),
      subscribeToTeacherAttendances(id, value => { setAdminTeachers(value); ready("adminTeachers"); }, fail("adminTeachers")),
      subscribeToGroups(id, value => { setGroups(value); ready("groups"); }, fail("groups")),
      subscribeToRooms(id, value => { setRooms(value); ready("rooms"); }, fail("rooms")),
      subscribeToIguardMeals(id, value => { setMeals(value); ready("meals"); }, fail("meals")),
      subscribeToIguardSchedule(id, value => { setSchedule(value); ready("schedule"); }, fail("schedule")),
      subscribeToIguardPosts(id, value => { setPosts(value); ready("posts"); }, fail("posts")),
      subscribeToIguardMovements(id, value => { setMovements(value); ready("movements"); }, fail("movements")),
      subscribeToIguardBuses(id, value => { setBuses(value); ready("buses"); }, fail("buses")),
      subscribeToIguardSeating(id, value => { setSeating(value); ready("seating"); }, fail("seating")),
      subscribeToMilestones(value => { setTodos(value); ready("todos"); }, fail("todos")),
      subscribeToIguardGuide(id, value => { setGuide(value); ready("guide"); }, fail("guide")),
      subscribeToRetreatPeriods(id, value => { setPeriods(value); ready("periods"); }, fail("periods")),
      subscribeToIguardAttendance(id, (value, info) => { setAttendanceKeys(value); setAttendanceInfo(info); ready("attendance"); }, fail("attendance")),
      subscribeToPartialAttendances(id, value => { setPartial(value); ready("partial"); }, fail("partial")),
      subscribeToCellColors(id, value => { setCellColors(value); ready("cellColors"); }, fail("cellColors")),
      subscribeToIguardGroupStaff(id, value => { setGroupStaff(value); ready("groupStaff"); }, fail("groupStaff")),
    ];
    return () => {
      alive = false;
      unsubs.forEach(u => u());
    };
  }, [id, retreatYear]);

  return {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, posts, movements, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff,
    connected,
  };
}
