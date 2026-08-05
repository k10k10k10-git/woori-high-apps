"use client";

// 학기 화면의 편집 가능 여부 단일 지점.
// 스탭 역할은 학기 화면을 "볼 수만" 있다(accessPolicy: semester=read).
// 각 탭은 useSemesterCanEdit()으로 저장 컨트롤을 잠근다 — Firebase Rules가 최종 경계지만
// 화면에서도 같은 계약을 보여야 "눌렀는데 실패"가 생기지 않는다.

import { createContext, useContext, type ReactNode } from "react";

const SemesterEditContext = createContext(true);

export function SemesterEditProvider({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return <SemesterEditContext.Provider value={canEdit}>{children}</SemesterEditContext.Provider>;
}

export function useSemesterCanEdit(): boolean {
  return useContext(SemesterEditContext);
}
