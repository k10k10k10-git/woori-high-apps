export type ConnectivityBannerMode = "hidden" | "offline" | "restored";

export type ConnectivityBannerState = {
  connected: boolean | null;
  graceElapsed: boolean;
  hasShownOffline: boolean;
  mode: ConnectivityBannerMode;
};

export type ConnectivityBannerEvent =
  | { type: "connection-changed"; connected: boolean }
  | { type: "grace-elapsed" }
  | { type: "restored-notice-expired" };

export const INITIAL_CONNECTIVITY_BANNER_STATE: ConnectivityBannerState = {
  connected: null,
  graceElapsed: false,
  hasShownOffline: false,
  mode: "hidden",
};

/**
 * Firebase 연결 상태만으로 저장 가능 여부를 판단한다.
 * 첫 연결 때 `.info/connected`가 잠시 false인 정상 구간은 유예 시간이 끝날 때까지 숨긴다.
 */
export function reduceConnectivityBanner(
  state: ConnectivityBannerState,
  event: ConnectivityBannerEvent,
): ConnectivityBannerState {
  if (event.type === "grace-elapsed") {
    if (state.connected !== false) return { ...state, graceElapsed: true };
    return {
      ...state,
      graceElapsed: true,
      hasShownOffline: true,
      mode: "offline",
    };
  }

  if (event.type === "restored-notice-expired") {
    if (state.mode !== "restored") return state;
    return { ...state, hasShownOffline: false, mode: "hidden" };
  }

  if (event.connected) {
    return {
      ...state,
      connected: true,
      mode: state.hasShownOffline ? "restored" : "hidden",
    };
  }

  if (!state.graceElapsed) {
    return { ...state, connected: false, mode: "hidden" };
  }

  return {
    ...state,
    connected: false,
    hasShownOffline: true,
    mode: "offline",
  };
}
