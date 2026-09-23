import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";
import type { ClassInfo } from "./types";

export async function fetchClassOptions(user: Pick<User, "uid" | "getIdToken">, semesterId: string, signal?: AbortSignal): Promise<ClassInfo[]> {
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다.");
  const response = await fetch(`/api/class-options?semesterId=${encodeURIComponent(semesterId)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  });
  const body = await response.json().catch(() => null);
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다.");
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "반 목록을 불러오지 못했습니다.");
  return body?.classes ?? [];
}
