import { getSupabase, isSupabaseConfigured } from "./supabase";
import { normalizeStoragePath, STORAGE_BUCKET, storageObjectKey } from "./storageUrl";

// Firebase `firebase/storage` 자리(작업 약속 2장). 버킷 `highschool`, 앱이 쓰는 경로는 그대로다.
// 객체 키만 `storageObjectKey`로 ASCII 로 적는다(한글 파일 이름 대응).

export interface FirebaseStorage { readonly bucket: string }
export interface StorageReference {
  readonly storage: FirebaseStorage;
  readonly bucket: string;
  /** 앱 경로(Firebase 때와 같은 값). DB 에 저장하는 값도 이것이다. */
  readonly fullPath: string;
  readonly name: string;
}
export interface UploadMetadata { contentType?: string; cacheControl?: string }
export interface UploadTaskSnapshot {
  bytesTransferred: number;
  totalBytes: number;
  state: "running" | "success" | "canceled" | "error";
  ref: StorageReference;
  metadata: UploadMetadata;
}
type TaskObserver = {
  next?: (snapshot: UploadTaskSnapshot) => void;
  error?: (error: StorageError) => void;
  complete?: () => void;
};
export interface UploadTask extends PromiseLike<UploadTaskSnapshot> {
  readonly snapshot: UploadTaskSnapshot;
  on(
    event: "state_changed",
    next?: ((snapshot: UploadTaskSnapshot) => void) | TaskObserver | null,
    error?: ((error: StorageError) => void) | null,
    complete?: (() => void) | null,
  ): () => void;
  cancel(): boolean;
  catch<T = never>(onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null): Promise<UploadTaskSnapshot | T>;
}
export type StringFormat = "raw" | "base64" | "base64url" | "data_url";

/** Firebase StorageError 와 같은 코드(`storage/object-not-found`, `storage/unauthorized` 등)를 쓴다. */
export class StorageError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = "StorageError";
  }
}

/** DB 에 저장한 주소는 오래 쓰므로 Firebase 다운로드 주소처럼 사실상 만료되지 않는 서명 주소를 만든다. */
const DOWNLOAD_URL_SECONDS = 60 * 60 * 24 * 365 * 10;

export const storage: FirebaseStorage = { bucket: STORAGE_BUCKET };
export function getStorage(): FirebaseStorage { return storage; }

export function ref(target: FirebaseStorage, path = ""): StorageReference {
  const fullPath = normalizeStoragePath(path);
  return { storage: target, bucket: target.bucket, fullPath, name: fullPath.split("/").pop() ?? "" };
}

function notConfigured(): StorageError {
  return new StorageError("storage/no-default-bucket", "파일 저장소 설정이 아직 끝나지 않았습니다. 담당자에게 알려 주세요.");
}

function client() {
  if (!isSupabaseConfigured()) throw notConfigured();
  return getSupabase();
}

/** Supabase Storage 오류(HTTP 상태·본문 statusCode·code)를 Firebase 코드로 바꾼다. 원문은 보이지 않는다. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const source = (error ?? {}) as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; name?: unknown };
  const status = typeof source.status === "number" ? source.status : undefined;
  const statusCode = typeof source.statusCode === "string" ? source.statusCode : "";
  const code = typeof source.code === "string" ? source.code : "";
  const message = typeof source.message === "string" ? source.message : "";
  if (status === 401 || status === 403 || statusCode === "401" || statusCode === "403" || code === "AccessDenied" || /row-level security/i.test(message)) {
    return new StorageError("storage/unauthorized", "이 파일을 다룰 권한이 없습니다.", status);
  }
  if (status === 404 || statusCode === "404" || code === "NoSuchKey" || /not found/i.test(message)) {
    return new StorageError("storage/object-not-found", "파일을 찾지 못했습니다.", status);
  }
  if (status === 413 || statusCode === "413" || code === "EntityTooLarge") {
    return new StorageError("storage/quota-exceeded", "파일이 너무 큽니다.", status);
  }
  if (status === undefined || status === 0 || source.name === "StorageUnknownError") {
    return new StorageError("storage/retry-limit-exceeded", "네트워크 오류로 파일을 처리하지 못했습니다.", status);
  }
  return new StorageError("storage/unknown", "파일을 처리하지 못했습니다.", status);
}

async function accessToken(): Promise<string> {
  const supabase = client();
  const { data } = await supabase.auth.getSession();
  // 로그인 전이면 공개 키로 보내고, 저장소 정책이 거절한다(Firebase 의 unauthorized 와 같다).
  return data.session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
}

function errorFromResponse(status: number, body: string): StorageError {
  let parsed: unknown = null;
  try { parsed = JSON.parse(body); } catch { /* 본문이 JSON 이 아니면 상태만 쓴다 */ }
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  return toStorageError({ status, statusCode: record.statusCode, code: record.code ?? record.error, message: record.message });
}

class SupabaseUploadTask implements UploadTask {
  snapshot: UploadTaskSnapshot;
  private readonly observers = new Set<TaskObserver>();
  private readonly promise: Promise<UploadTaskSnapshot>;
  private request: XMLHttpRequest | null = null;
  private canceled = false;
  private settled = false;

  constructor(target: StorageReference, private readonly body: Blob, metadata: UploadMetadata) {
    this.snapshot = { bytesTransferred: 0, totalBytes: body.size, state: "running", ref: target, metadata };
    this.promise = this.run();
    // 아무도 기다리지 않는 업로드도 처리되지 않은 거절로 남지 않게 한다.
    this.promise.catch(() => {});
  }

  private emit(update: Partial<UploadTaskSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const observer of [...this.observers]) observer.next?.(this.snapshot);
  }

  private async run(): Promise<UploadTaskSnapshot> {
    try {
      const token = await accessToken();
      if (this.canceled) throw new StorageError("storage/canceled", "업로드를 취소했습니다.");
      const key = storageObjectKey(this.snapshot.ref.fullPath);
      const contentType = this.snapshot.metadata.contentType || this.body.type || "application/octet-stream";
      const cacheControl = this.snapshot.metadata.cacheControl ?? "3600";
      if (typeof XMLHttpRequest === "undefined") {
        // 진행률을 알릴 수 없는 환경(서버·시험)은 SDK 업로드를 쓴다.
        const { error } = await client().storage.from(STORAGE_BUCKET).upload(key, this.body, { upsert: true, contentType, cacheControl });
        if (error) throw toStorageError(error);
      } else {
        await this.send(key, token, contentType, cacheControl);
      }
      this.settled = true;
      this.emit({ bytesTransferred: this.snapshot.totalBytes, state: "success" });
      for (const observer of [...this.observers]) observer.complete?.();
      return this.snapshot;
    } catch (cause) {
      const error = this.canceled ? new StorageError("storage/canceled", "업로드를 취소했습니다.") : toStorageError(cause);
      this.settled = true;
      this.snapshot = { ...this.snapshot, state: this.canceled ? "canceled" : "error" };
      for (const observer of [...this.observers]) observer.error?.(error);
      throw error;
    }
  }

  private send(key: string, token: string, contentType: string, cacheControl: string): Promise<void> {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/+$/, "");
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      this.request = request;
      request.open("POST", `${base}/storage/v1/object/${STORAGE_BUCKET}/${key}`);
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
      request.setRequestHeader("x-upsert", "true");
      request.setRequestHeader("Content-Type", contentType);
      request.setRequestHeader("cache-control", `max-age=${cacheControl}`);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) this.emit({ bytesTransferred: Math.min(event.loaded, this.snapshot.totalBytes) });
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(errorFromResponse(request.status, request.responseText));
      };
      request.onerror = () => reject(new StorageError("storage/retry-limit-exceeded", "네트워크 오류로 파일을 올리지 못했습니다."));
      request.onabort = () => reject(new StorageError("storage/canceled", "업로드를 취소했습니다."));
      request.send(this.body);
    });
  }

  on(
    _event: "state_changed",
    next?: ((snapshot: UploadTaskSnapshot) => void) | TaskObserver | null,
    error?: ((error: StorageError) => void) | null,
    complete?: (() => void) | null,
  ): () => void {
    const observer: TaskObserver = next && typeof next === "object"
      ? next
      : { next: next ?? undefined, error: error ?? undefined, complete: complete ?? undefined };
    this.observers.add(observer);
    // 이미 끝난 업로드에 늦게 붙어도 결과를 받게 한다.
    if (this.settled) {
      this.promise.then(() => observer.complete?.(), (reason: StorageError) => observer.error?.(reason));
    }
    return () => { this.observers.delete(observer); };
  }

  cancel(): boolean {
    if (this.settled) return false;
    this.canceled = true;
    this.request?.abort();
    return true;
  }

  then<A = UploadTaskSnapshot, B = never>(
    onFulfilled?: ((value: UploadTaskSnapshot) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.promise.then(onFulfilled, onRejected);
  }

  catch<T = never>(onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null): Promise<UploadTaskSnapshot | T> {
    return this.promise.catch(onRejected);
  }
}

function toBlob(data: Blob | ArrayBuffer | Uint8Array, contentType?: string): Blob {
  if (data instanceof Blob) return data;
  return new Blob([data instanceof Uint8Array ? new Uint8Array(data) : data], contentType ? { type: contentType } : undefined);
}

export function uploadBytesResumable(target: StorageReference, data: Blob | ArrayBuffer | Uint8Array, metadata: UploadMetadata = {}): UploadTask {
  return new SupabaseUploadTask(target, toBlob(data, metadata.contentType), metadata);
}

export async function uploadBytes(target: StorageReference, data: Blob | ArrayBuffer | Uint8Array, metadata: UploadMetadata = {}) {
  const snapshot = await uploadBytesResumable(target, data, metadata);
  return { ref: snapshot.ref, metadata: snapshot.metadata };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Firebase `uploadString` — `data_url` 은 `data:<형식>;base64,...` 을 받는다. */
export async function uploadString(target: StorageReference, value: string, format: StringFormat = "raw", metadata: UploadMetadata = {}) {
  let bytes: Uint8Array;
  let contentType = metadata.contentType;
  if (format === "data_url") {
    const match = /^data:([^;,]*)?((?:;[^;,]+)*?)(;base64)?,([\s\S]*)$/.exec(value);
    if (!match) throw new StorageError("storage/invalid-format", "파일 내용을 읽지 못했습니다.");
    contentType ||= match[1] || undefined;
    bytes = match[3] ? decodeBase64(match[4]) : new TextEncoder().encode(decodeURIComponent(match[4]));
  } else if (format === "base64" || format === "base64url") {
    bytes = decodeBase64(value);
  } else {
    bytes = new TextEncoder().encode(value);
  }
  return uploadBytes(target, bytes, { ...metadata, ...(contentType ? { contentType } : {}) });
}

export async function getDownloadURL(target: StorageReference): Promise<string> {
  const { data, error } = await client().storage.from(STORAGE_BUCKET).createSignedUrl(storageObjectKey(target.fullPath), DOWNLOAD_URL_SECONDS);
  if (error || !data?.signedUrl) throw toStorageError(error ?? { status: 404 });
  return data.signedUrl;
}

export async function deleteObject(target: StorageReference): Promise<void> {
  const bucket = client().storage.from(STORAGE_BUCKET);
  const key = storageObjectKey(target.fullPath);
  const { data, error } = await bucket.remove([key]);
  if (error) throw toStorageError(error);
  if (data && data.length > 0) return;
  // Supabase 는 없는 파일과 정책상 못 지운 파일을 모두 빈 결과로 돌려준다. Firebase 처럼 둘을 나눈다.
  const exists = await bucket.exists(key).catch(() => ({ data: false }));
  if (exists.data) throw new StorageError("storage/unauthorized", "이 파일을 지울 권한이 없습니다.");
  throw new StorageError("storage/object-not-found", "파일을 찾지 못했습니다.");
}
