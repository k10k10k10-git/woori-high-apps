export function siteRequestAttachmentPath(ownerUid: string, requestId: string): string {
  return `site-requests/${ownerUid}/${requestId}/attachment.jpg`;
}
