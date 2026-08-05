export function safeArchiveFileName(name: string): string {
  return name.normalize("NFKC").replace(/[^0-9A-Za-z가-힣._-]+/g, "_").slice(-120);
}
