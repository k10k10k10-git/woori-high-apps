"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  subscribeToParticipants,
  subscribeToCellColors,
  getStudentsByYear,
} from "@/lib/db";
import { Participant, Student } from "@/lib/types";

interface RetreatDataContextValue {
  participants: Record<string, Participant>;
  cellColors: Record<string, string>;
  students: Record<string, Student>;
  loading: boolean;
  error: string | null;
}

const RetreatDataContext = createContext<RetreatDataContextValue>({
  participants: {},
  cellColors: {},
  students: {},
  loading: true,
  error: null,
});

export function useRetreatData() {
  return useContext(RetreatDataContext);
}

interface Props {
  retreatId: string;
  year: number;
  children: React.ReactNode;
}

export function RetreatDataProvider({ retreatId, year, children }: Props) {
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // retreatId/year가 바뀌면 렌더 중에 loading/error를 리셋 (effect 내 동기 setState 대신)
  const scopeKey = `${retreatId}:${year}`;
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  if (scopeKey !== prevScopeKey) {
    setPrevScopeKey(scopeKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    // One-time fetch of students
    getStudentsByYear(year)
      .then((stds) => {
        setStudents(stds);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "학생 데이터를 불러오지 못했습니다.");
        setLoading(false);
      });

    // Real-time subscriptions
    const unsubParticipants = subscribeToParticipants(retreatId, setParticipants);
    const unsubCellColors = subscribeToCellColors(retreatId, setCellColors);

    return () => {
      unsubParticipants();
      unsubCellColors();
    };
  }, [retreatId, year]);

  return (
    <RetreatDataContext.Provider value={{ participants, cellColors, students, loading, error }}>
      {children}
    </RetreatDataContext.Provider>
  );
}
