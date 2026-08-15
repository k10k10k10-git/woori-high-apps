import { notFound } from "next/navigation";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import SundayMinistryClient from "../SundayMinistryClient";

export default async function SundayMinistryTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { team } = await params;
  const query = await searchParams;
  const meta = sundayTeamOf(team);
  if (!meta) notFound();
  return <SundayMinistryClient team={meta.key} initialTab={query.tab} />;
}
