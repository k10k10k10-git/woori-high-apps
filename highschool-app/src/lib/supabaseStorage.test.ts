import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(), createSignedUrl: vi.fn(), remove: vi.fn(), exists: vi.fn(), from: vi.fn(),
  session: { access_token: "user-token" } as { access_token: string } | null,
}));
vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: mocks.session } }) },
    storage: { from: mocks.from },
  }),
}));

import { deleteObject, getDownloadURL, ref, storage, toStorageError, uploadBytesResumable, uploadString } from "./supabaseStorage";
import { isTrustedFileUrl, storageObjectKey } from "./storageUrl";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session = { access_token: "user-token" };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  mocks.from.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl, remove: mocks.remove, exists: mocks.exists });
  mocks.upload.mockResolvedValue({ data: { path: "x" }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("파일 경로 → 저장소 키", () => {
  it("ASCII 경로는 그대로 두고 한글·특수 글자만 바이트 단위로 적어 서로 겹치지 않게 한다", () => {
    expect(storageObjectKey("/site-requests/uid_1/req-1/attachment.jpg")).toBe("site-requests/uid_1/req-1/attachment.jpg");
    expect(storageObjectKey("semesters/2026-1/archive/f1/숙소.pdf")).toBe("semesters/2026-1/archive/f1/!EC!88!99!EC!86!8C.pdf");
    expect(storageObjectKey("a/b c!.pdf")).toBe("a/b!20c!21.pdf");
    expect(storageObjectKey("a/!21")).not.toBe(storageObjectKey("a/!"));
    expect(storageObjectKey("a/숙소.pdf")).toMatch(/^[A-Za-z0-9/_.!-]+$/);
  });

  it("옛 Firebase 주소와 이 프로젝트 버킷의 서명 주소만 믿고, 경로를 주면 그 파일의 주소인지까지 본다", () => {
    const path = "site-requests/u/r/attachment.jpg";
    const signed = `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/highschool/${path}?token=t`;
    expect(isTrustedFileUrl("https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg", path)).toBe(true);
    expect(isTrustedFileUrl(signed, path)).toBe(true);
    expect(isTrustedFileUrl(signed, "site-requests/other/r/attachment.jpg")).toBe(false);
    expect(isTrustedFileUrl(`https://zzzzzzzzzzzzzzzzzzzz.supabase.co/storage/v1/object/sign/highschool/${path}?token=t`, path)).toBe(false);
    expect(isTrustedFileUrl("https://example.com/a.jpg")).toBe(false);
  });
});

describe("Firebase Storage 와 같은 이름의 함수", () => {
  it("업로드는 덮어쓰기로 같은 경로에 올리고 진행·완료를 알린다", async () => {
    const target = ref(storage, "retreats/r1/iguard/lodging-maps/m1/숙소.pdf");
    expect(target).toMatchObject({ bucket: "highschool", fullPath: "retreats/r1/iguard/lodging-maps/m1/숙소.pdf", name: "숙소.pdf" });
    const task = uploadBytesResumable(target, new Blob(["%PDF-1"]), { contentType: "application/pdf" });
    const next = vi.fn();
    const complete = vi.fn();
    task.on("state_changed", next, undefined, complete);
    const snapshot = await task;
    expect(mocks.from).toHaveBeenCalledWith("highschool");
    expect(mocks.upload).toHaveBeenCalledWith(storageObjectKey(target.fullPath), expect.any(Blob), { upsert: true, contentType: "application/pdf", cacheControl: "3600" });
    expect(snapshot).toMatchObject({ state: "success", bytesTransferred: 6, totalBytes: 6 });
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ bytesTransferred: 6 }));
    expect(complete).toHaveBeenCalledOnce();
  });

  it("정책 거절은 storage/unauthorized 로 끝나고 오류 관찰자도 받는다", async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { status: 400, statusCode: "403", message: "new row violates row-level security policy" } });
    const task = uploadBytesResumable(ref(storage, "semesters/s/archive/f/a.txt"), new Blob(["a"]));
    const error = vi.fn();
    task.on("state_changed", null, error);
    await expect(task).rejects.toMatchObject({ code: "storage/unauthorized" });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "storage/unauthorized" }));
  });

  it("브라우저에서는 진행률을 받으려고 같은 저장소 주소로 직접 올리고, 취소하면 storage/canceled 로 끝난다", async () => {
    const sent: { url: string; headers: Record<string, string>; instance?: FakeRequest }[] = [];
    class FakeRequest {
      status = 0; responseText = ""; upload: { onprogress?: (event: ProgressEvent) => void } = {};
      onload?: () => void; onerror?: () => void; onabort?: () => void;
      private record = { url: "", headers: {} as Record<string, string>, instance: this as FakeRequest };
      open(_method: string, url: string) { this.record.url = url; sent.push(this.record); }
      setRequestHeader(key: string, value: string) { this.record.headers[key] = value; }
      send() { /* 시험에서 직접 진행시킨다 */ }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const progress = vi.fn();
    const task = uploadBytesResumable(ref(storage, "semesters/s/archive/f/자료.pdf"), new Blob(["0123456789"]), { contentType: "application/pdf" });
    task.on("state_changed", (snapshot) => progress(snapshot.bytesTransferred));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].url).toBe(`https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/highschool/${storageObjectKey("semesters/s/archive/f/자료.pdf")}`);
    expect(sent[0].headers).toMatchObject({ Authorization: "Bearer user-token", apikey: "anon-key", "x-upsert": "true", "Content-Type": "application/pdf" });
    sent[0].instance!.upload.onprogress?.({ lengthComputable: true, loaded: 4 } as ProgressEvent);
    expect(progress).toHaveBeenLastCalledWith(4);
    expect(task.cancel()).toBe(true);
    await expect(task).rejects.toMatchObject({ code: "storage/canceled" });
    expect(task.cancel()).toBe(false);
  });

  it("data_url 문자열은 내용과 형식을 풀어서 올린다", async () => {
    await uploadString(ref(storage, "site-requests/u/r/attachment.jpg"), "data:image/jpeg;base64,/9j/AA==", "data_url", { contentType: "image/jpeg" });
    const [, body, options] = mocks.upload.mock.calls[0];
    expect(options).toMatchObject({ contentType: "image/jpeg" });
    expect(new Uint8Array(await (body as Blob).arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
  });

  it("다운로드 주소는 DB 에 오래 남겨 쓰도록 10년짜리 서명 주소를 만든다", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    expect(await getDownloadURL(ref(storage, "a/숙소.pdf"))).toBe("https://signed");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("a/!EC!88!99!EC!86!8C.pdf", 315_360_000);
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { status: 400, statusCode: "404", message: "Object not found" } });
    await expect(getDownloadURL(ref(storage, "a/b"))).rejects.toMatchObject({ code: "storage/object-not-found" });
  });

  it("삭제는 없는 파일과 권한 없는 파일을 Firebase 처럼 구분한다", async () => {
    mocks.remove.mockResolvedValueOnce({ data: [{ name: "a" }], error: null });
    await expect(deleteObject(ref(storage, "a/b"))).resolves.toBeUndefined();
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.exists.mockResolvedValueOnce({ data: false, error: null });
    await expect(deleteObject(ref(storage, "a/b"))).rejects.toMatchObject({ code: "storage/object-not-found" });
    mocks.exists.mockResolvedValueOnce({ data: true, error: null });
    await expect(deleteObject(ref(storage, "a/b"))).rejects.toMatchObject({ code: "storage/unauthorized" });
  });

  it.each([
    [{ status: 403 }, "storage/unauthorized"],
    [{ status: 400, statusCode: "404" }, "storage/object-not-found"],
    [{ status: 413 }, "storage/quota-exceeded"],
    [{ name: "StorageUnknownError" }, "storage/retry-limit-exceeded"],
    [{ status: 500, message: "stack" }, "storage/unknown"],
  ])("저장소 오류를 Firebase 코드로 바꾼다 (%o)", (source, code) => {
    expect(toStorageError(source).code).toBe(code);
  });
});
