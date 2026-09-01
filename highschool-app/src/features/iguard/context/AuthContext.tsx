"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth as usePortalAuth } from "@/context/AuthContext";

type IguardAuthValue = ReturnType<typeof usePortalAuth>;

const AuthContext = createContext<IguardAuthValue | null>(null);

/**
 * 이가드 레거시 import 경계를 유지하는 어댑터다.
 * 인증·역할 조회는 루트 AuthProvider가 한 번만 수행하고 현장 화면은 그 값을 재사용한다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = usePortalAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within Iguard AuthProvider");
  return context;
}
