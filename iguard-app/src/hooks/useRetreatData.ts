"use client";
import { useEffect, useState } from "react";
import {
  subscribeToRetreat, subscribeToStudentsByYear, subscribeToGroups, subscribeToRooms,
  subscribeToIguardMeals, subscribeToIguardSchedule,
  subscribeToIguardPosts, subscribeToIguardMovements, subscribeToIguardBuses,
  subscribeToIguardSeating, subscribeToMilestones, subscribeToIguardGuide,
  subscribeToRetreatPeriods, subscribeToIguardAttendance, subscribeToPartialAttendances,
  subscribeToTeacherAttendances, subscribeToIguardGroupStaff, subscribeToCellColors,
  subscribeToConnection,
} from "@/lib/db";
import {
  Retreat, Group, Room, Student, IguardMeal, IguardScheduleBlock,
  IguardPost, IguardMovement, IguardBus, IguardSeating, Milestone, RetreatPeriod,
  TeacherAttendance,
} from "@/lib/types";

export interface RetreatData {
  retreat: Retreat | null;
  retreatLoading: boolean;
  dataLoading: boolean;
  loadError: string | null;
  groups: Group[];
  rooms: Room[];
  students: Record<string, Student>;
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
  partial: Record<string, "선복귀" | "후발대">;
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
  const [partial, setPartial] = useState<Record<string, "선복귀" | "후발대">>({});
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [groupStaff, setGroupStaff] = useState<Record<string, string[]>>({});
  const [connected, setConnected] = useState(true);

  // 수련회 메타 구독
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRetreat(id, r => { setRetreat(r); setRetreatLoading(false); });
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
      "students", "adminTeachers", "groups", "rooms", "meals", "schedule", "posts",
      "movements", "buses", "seating", "todos", "guide", "periods", "attendance", "partial", "cellColors", "groupStaff",
    ]);
    const ready = (key: string) => {
      pending.delete(key);
      if (alive && pending.size === 0) setDataLoading(false);
    };
    const unsubs = [
      subscribeToStudentsByYear(retreatYear, value => { setStudents(value); ready("students"); }),
      subscribeToTeacherAttendances(id, value => { setAdminTeachers(value); ready("adminTeachers"); }),
      subscribeToGroups(id, value => { setGroups(value); ready("groups"); }),
      subscribeToRooms(id, value => { setRooms(value); ready("rooms"); }),
      subscribeToIguardMeals(id, value => { setMeals(value); ready("meals"); }),
      subscribeToIguardSchedule(id, value => { setSchedule(value); ready("schedule"); }),
      subscribeToIguardPosts(id, value => { setPosts(value); ready("posts"); }),
      subscribeToIguardMovements(id, value => { setMovements(value); ready("movements"); }),
      subscribeToIguardBuses(id, value => { setBuses(value); ready("buses"); }),
      subscribeToIguardSeating(id, value => { setSeating(value); ready("seating"); }),
      subscribeToMilestones(value => { setTodos(value); ready("todos"); }),
      subscribeToIguardGuide(id, value => { setGuide(value); ready("guide"); }),
      subscribeToRetreatPeriods(id, value => { setPeriods(value); ready("periods"); }),
      subscribeToIguardAttendance(id, value => { setAttendanceKeys(value); ready("attendance"); }),
      subscribeToPartialAttendances(id, value => { setPartial(value); ready("partial"); }),
      subscribeToCellColors(id, value => { setCellColors(value); ready("cellColors"); }),
      subscribeToIguardGroupStaff(id, value => { setGroupStaff(value); ready("groupStaff"); }),
    ];
    return () => {
      alive = false;
      unsubs.forEach(u => u());
    };
  }, [id, retreatYear]);

  return {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, adminTeachers,
    meals, schedule, posts, movements, buses, seating,
    todos, guide, periods, attendanceKeys, partial, cellColors, groupStaff,
    connected,
  };
}
