// Firebase 와 같은 모양의 오류(`code`, `message`). 앱은 `/permission[\s_-]+denied/i` 로 code·message 를 함께 본다.
export type RtdbErrorCode = "PERMISSION_DENIED" | "UNAVAILABLE" | "UNKNOWN_ERROR";

export interface RtdbError extends Error {
  code: string;
  /** 서버가 준 원래 사유(예: `validation_failed:retreats/x/name`). 화면 표시용이 아니다. */
  serverMessage?: string;
}

export function rtdbError(code: string, message: string, serverMessage?: string): RtdbError {
  const error = new Error(message) as RtdbError;
  error.code = code;
  if (serverMessage) error.serverMessage = serverMessage;
  return error;
}

/** set/update/remove 거부: Firebase 는 `PERMISSION_DENIED: Permission denied`. 검증 실패도 같은 code 다. */
export function writeDeniedError(serverMessage?: string): RtdbError {
  return rtdbError("PERMISSION_DENIED", "PERMISSION_DENIED: Permission denied", serverMessage);
}

/** 구독 취소(cancel 콜백): Firebase 는 `permission_denied at /path: Client doesn't have permission ...`. */
export function listenDeniedError(path: string): RtdbError {
  return rtdbError("PERMISSION_DENIED", `permission_denied at /${path}: Client doesn't have permission to access the desired data.`);
}

/** get() 거부: Firebase 는 message 가 `Permission denied` 인 Error 를 준다. */
export function getDeniedError(serverMessage?: string): RtdbError {
  return rtdbError("PERMISSION_DENIED", "Permission denied", serverMessage);
}

export function offlineError(): RtdbError {
  return rtdbError("UNAVAILABLE", "Client is offline.");
}

/** 트랜잭션 실패: Firebase 는 사유 문자열(`permission_denied`, `maxretry`)을 message 로 쓴다. */
export function transactionError(reason: "permission_denied" | "maxretry" | "disconnect", serverMessage?: string): RtdbError {
  return rtdbError(reason === "permission_denied" ? "PERMISSION_DENIED" : reason.toUpperCase(), reason, serverMessage);
}
