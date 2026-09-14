import { notFound } from "next/navigation";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import SundayMinistryClient from "@/app/sunday-ministry/SundayMinistryClient";

export default async function Page({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ tab?: string; workspace?: string }> }) {
  const { team } = await params;
  const query = await searchParams;
  const meta = sundayTeamOf(team);
  if (!meta) notFound();
  return <SundayMinistryClient team={meta.key} initialTab={query.tab} workspaceId={query.workspace} />;
}
