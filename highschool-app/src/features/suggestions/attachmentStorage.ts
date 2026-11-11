import { deleteObject, getDownloadURL, ref, uploadString } from "@/lib/supabaseStorage";
import { storage } from "@/lib/firebase";
import type { PreparedSiteRequestAttachment, SiteRequestAttachment } from "./siteRequest";
import { siteRequestAttachmentPath } from "./attachmentPath";

export async function uploadSiteRequestAttachment(
  ownerUid: string,
  requestId: string,
  attachment: PreparedSiteRequestAttachment,
): Promise<SiteRequestAttachment> {
  const filePath = siteRequestAttachmentPath(ownerUid, requestId);
  const target = ref(storage, filePath);
  await uploadString(target, attachment.dataUrl, "data_url", { contentType: "image/jpeg" });
  return {
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    filePath,
    fileUrl: await getDownloadURL(target),
  };
}

export async function deleteSiteRequestAttachment(filePath: string): Promise<void> {
  if (!filePath.startsWith("site-requests/")) return;
  try {
    await deleteObject(ref(storage, filePath));
  } catch (error) {
    if ((error as { code?: string }).code !== "storage/object-not-found") throw error;
  }
}
