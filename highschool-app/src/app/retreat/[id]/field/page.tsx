"use client";

import IguardClient from "./IguardClient";

// 인증·역할은 루트 providers.tsx의 AuthProvider가 한 번만 수행한다.
// 현장 화면은 그 값을 그대로 쓰고, 자기 인증 조회를 열지 않는다
// (iguardNavigationContract.test.ts가 지킨다).
export default function RetreatFieldPage() {
  return (
    <div className="iguard-scope">
      <IguardClient />
    </div>
  );
}
