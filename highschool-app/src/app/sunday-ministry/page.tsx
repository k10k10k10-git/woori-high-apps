import SundayMinistryClient from "./SundayMinistryClient";

export default async function SundayMinistryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const query = await searchParams;
  return <SundayMinistryClient initialTab={query.tab} />;
}
