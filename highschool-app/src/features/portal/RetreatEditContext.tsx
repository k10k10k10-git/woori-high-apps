"use client";

// 수련회 행정 화면의 편집 가능 여부 단일 지점 — 학기 화면의 SemesterEditContext와 같은 계약이다.
//
// 스탭팀장·이가드팀은 행정 화면을 "볼 수만" 있다(accessPolicy: retreat-admin = read).
// 탭이 17개라 컨트롤을 하나씩 잠그는 대신 두 겹으로 막는다:
//   ① 이 컨텍스트 — 드래그처럼 폼 요소가 아닌 조작을 각 탭이 스스로 잠근다
//   ② RetreatPageClient의 <fieldset disabled> — 내부의 button·input·select·textarea를
//      브라우저가 전부 비활성화한다(display:contents라 레이아웃에는 영향이 없다)
//
// ⚠ 화면 차단은 사용성 장치다. Rules도 방학 역할에 따라 행정·현장 쓰기를 분리한다.

import { createContext, useContext, type ReactNode } from "react";

const RetreatEditContext = createContext(true);

export function RetreatEditProvider({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return <RetreatEditContext.Provider value={canEdit}>{children}</RetreatEditContext.Provider>;
}

export function useRetreatCanEdit(): boolean {
  return useContext(RetreatEditContext);
}
