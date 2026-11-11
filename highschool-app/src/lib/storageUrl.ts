// 파일 저장소 경로·주소의 순수 규칙. Supabase 클라이언트를 import 하지 않아 화면 검증과 시험에서 쓴다.

/** 고등부 앱 파일 버킷. 경로는 Firebase Storage 때와 같다. */
export const STORAGE_BUCKET = "highschool";

/** 옛 Firebase 다운로드 주소. 이관 전 기록의 첨부를 계속 보여 주기 위해 허용한다. */
const FIREBASE_DOWNLOAD_PREFIX = "https://firebasestorage.googleapis.com/";

/** Firebase ref 처럼 앞뒤·중복 `/`를 정리한다. */
export function normalizeStoragePath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

/**
 * 앱 경로 → Supabase 객체 키. Supabase Storage 는 한글 등 ASCII 밖 글자를 키로 받지 않으므로
 * `[A-Za-z0-9/_.-]` 밖의 글자는 UTF-8 바이트마다 `!XX`(대문자 16진수)로 적는다. `!` 자신도
 * `!21`로 바꾸므로 서로 다른 경로가 같은 키가 되지 않는다. 경로의 첫 조각(폴더)은 ASCII 라
 * 저장소 정책이 그대로 읽는다. Firebase 파일을 옮길 때도 이 함수로 키를 만든다.
 */
export function storageObjectKey(path: string): string {
  const bytes = new TextEncoder().encode(normalizeStoragePath(path));
  let key = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    key += byte < 0x80 && /[A-Za-z0-9/_.-]/.test(char) ? char : `!${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return key;
}

/** 이 프로젝트 버킷의 서명 주소 앞부분. 공개 설정이 없으면 null. */
export function signedFileUrlPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/sign/${STORAGE_BUCKET}/` : null;
}

/** 저장된 파일 주소가 이 앱 저장소의 것인지 본다. `filePath`를 주면 Supabase 주소는 그 파일의 것이어야 한다. */
export function isTrustedFileUrl(url: string, filePath?: string): boolean {
  if (url.startsWith(FIREBASE_DOWNLOAD_PREFIX)) return true;
  const prefix = signedFileUrlPrefix();
  if (!prefix || !url.startsWith(prefix)) return false;
  if (filePath === undefined) return true;
  return url.startsWith(`${prefix}${storageObjectKey(filePath)}?`);
}
