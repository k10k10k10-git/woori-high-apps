import "server-only";
import { PraiseRequestError } from "./firebaseAdmin";
import { PraiseDomainError, requireValue } from "./validation";

const MAX_BYTES = 1_500_000;
export function praiseResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function praiseHttp(action: () => Promise<unknown>) {
  try {
    return praiseResponse(await action());
  } catch (error) {
    if (
      error instanceof PraiseRequestError ||
      error instanceof PraiseDomainError
    )
      return praiseResponse(
        { error: error.message, code: error.code },
        error.status,
      );
    return praiseResponse(
      {
        error: "찬양팀 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        code: "unavailable",
      },
      503,
    );
  }
}
export async function praiseJson(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  requireValue(
    !origin || origin === new URL(request.url).origin,
    "이 사이트에서 다시 요청해 주세요.",
    "invalid_origin",
    403,
  );
  requireValue(
    request.headers.get("sec-fetch-site") !== "cross-site",
    "이 사이트에서 다시 요청해 주세요.",
    "invalid_origin",
    403,
  );
  requireValue(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "JSON 형식으로 요청해 주세요.",
    "invalid_content_type",
    415,
  );
  const length = Number(request.headers.get("content-length") ?? 0);
  requireValue(
    Number.isFinite(length) && length >= 0 && length <= MAX_BYTES,
    "한 번에 전송할 수 있는 용량을 초과했습니다.",
    "too_large",
    413,
  );
  const reader = request.body?.getReader();
  requireValue(reader, "요청 내용이 없습니다.");
  let size = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new PraiseDomainError(
          413,
          "한 번에 전송할 수 있는 용량을 초과했습니다.",
          "too_large",
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof PraiseDomainError) throw error;
    throw new PraiseDomainError(400, "요청 내용을 읽을 수 없습니다.");
  } finally {
    reader.releaseLock();
  }
}
