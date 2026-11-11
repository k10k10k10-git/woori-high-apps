import { isTrustedFileUrl } from "@/lib/storageUrl";

export type SiteRequestStatus = "received" | "resolved";

export interface SiteRequestAttachment {
  name: string;
  type: "image/jpeg";
  size: number;
  /** 새 요청은 파일 본문을 Storage에 두고 RTDB에는 경로와 다운로드 주소만 저장한다. */
  filePath?: string;
  fileUrl?: string;
  /** 분리 전 요청의 읽기 호환 전용. 새 요청 저장에는 사용하지 않는다. */
  dataUrl?: string;
}

export interface PreparedSiteRequestAttachment {
  name: string;
  type: "image/jpeg";
  size: number;
  dataUrl: string;
}

export interface SiteRequest {
  id: string;
  ownerUid: string;
  kind: string;
  category: string;
  title: string;
  description: string;
  page: string;
  urgency: string;
  reproduction: string;
  expected: string;
  anonymous: boolean;
  reporterName: string;
  roleLabel: string;
  createdAt: number;
  status: SiteRequestStatus;
  attachment?: SiteRequestAttachment;
  resolvedAt?: number;
  resolvedBy?: string;
  resolutionNote?: string;
  notifiedAt?: number;
}

export type NewSiteRequest = Omit<SiteRequest, "id" | "status" | "attachment" | "resolvedAt" | "resolvedBy" | "resolutionNote" | "notifiedAt"> & {
  attachment?: PreparedSiteRequestAttachment;
};

/** 짧은 제안도 유효하다. 제목과 본문이 비어 있지 않은지만 확인한다. */
export function canSendSiteRequest(input: Pick<SiteRequest, "title" | "description">): boolean {
  return input.title.trim().length > 0 && input.description.trim().length > 0;
}

function text(value: unknown, maxLength = 5000): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function attachment(ownerUid: string, requestId: string, value: unknown): SiteRequestAttachment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<SiteRequestAttachment>;
  if (
    item.type !== "image/jpeg"
    || typeof item.name !== "string"
    || typeof item.size !== "number"
  ) return undefined;
  const base = {
    name: item.name.slice(0, 120),
    type: "image/jpeg" as const,
    size: item.size,
  };
  const expectedPrefix = `site-requests/${ownerUid}/${requestId}/`;
  if (
    typeof item.filePath === "string"
    && item.filePath.startsWith(expectedPrefix)
    && typeof item.fileUrl === "string"
    && isTrustedFileUrl(item.fileUrl, item.filePath)
  ) {
    return { ...base, filePath: item.filePath, fileUrl: item.fileUrl };
  }
  if (typeof item.dataUrl !== "string" || !item.dataUrl.startsWith("data:image/jpeg;base64,")) return undefined;
  return {
    ...base,
    dataUrl: item.dataUrl,
  };
}

export function siteRequestAttachmentUrl(value: SiteRequestAttachment): string {
  return value.fileUrl || value.dataUrl || "";
}

export function normalizeSiteRequest(ownerUid: string, id: string, value: unknown): SiteRequest | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SiteRequest>;
  const createdAt = number(item.createdAt);
  const title = text(item.title, 160).trim();
  const description = text(item.description, 5000).trim();
  if (!createdAt || !title || !description) return null;
  const status: SiteRequestStatus = item.status === "resolved" ? "resolved" : "received";
  return {
    id,
    ownerUid,
    kind: text(item.kind, 40) || "사이트 건의사항",
    category: text(item.category, 40) || "기타",
    title,
    description,
    page: text(item.page, 300),
    urgency: text(item.urgency, 40) || "보통",
    reproduction: text(item.reproduction, 5000),
    expected: text(item.expected, 5000),
    anonymous: item.anonymous === true,
    reporterName: text(item.reporterName, 80),
    roleLabel: text(item.roleLabel, 120),
    createdAt,
    status,
    ...(attachment(ownerUid, id, item.attachment) ? { attachment: attachment(ownerUid, id, item.attachment) } : {}),
    ...(number(item.resolvedAt) ? { resolvedAt: number(item.resolvedAt) } : {}),
    ...(text(item.resolvedBy, 80) ? { resolvedBy: text(item.resolvedBy, 80) } : {}),
    ...(text(item.resolutionNote, 1000) ? { resolutionNote: text(item.resolutionNote, 1000) } : {}),
    ...(number(item.notifiedAt) ? { notifiedAt: number(item.notifiedAt) } : {}),
  };
}

/** iguardPending의 접근 승인 필드와 siteRequests를 섞지 않고 요청만 추출한다. */
export function normalizeSiteRequestsRoot(raw: unknown): SiteRequest[] {
  if (!raw || typeof raw !== "object") return [];
  const requests: SiteRequest[] = [];
  for (const [ownerUid, ownerValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!ownerValue || typeof ownerValue !== "object") continue;
    const siteRequests = (ownerValue as { siteRequests?: unknown }).siteRequests;
    if (!siteRequests || typeof siteRequests !== "object") continue;
    for (const [id, value] of Object.entries(siteRequests as Record<string, unknown>)) {
      const request = normalizeSiteRequest(ownerUid, id, value);
      if (request) requests.push(request);
    }
  }
  return requests.sort((a, b) => b.createdAt - a.createdAt);
}

export function unnotifiedResolvedRequests(requests: SiteRequest[]): SiteRequest[] {
  return requests.filter((request) => request.status === "resolved" && !request.notifiedAt);
}
