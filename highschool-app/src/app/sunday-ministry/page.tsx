import { SUNDAY_MINISTRY_DEFAULT_TEAM } from "@/features/portal/featureCatalog";
import SundayMinistryClient from "./SundayMinistryClient";

// 팀 없는 기존 주소는 그대로 살려 둔다(홈 카드·통합검색·북마크가 가리킨다).
export default async function SundayMinistryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const query = await searchParams;
  return <SundayMinistryClient team={SUNDAY_MINISTRY_DEFAULT_TEAM} initialTab={query.tab} />;
}
