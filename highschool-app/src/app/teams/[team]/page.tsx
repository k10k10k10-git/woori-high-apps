import { notFound } from "next/navigation";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import TeamWorkspace from "@/features/teams/TeamWorkspace";

export default async function Page({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  const meta = sundayTeamOf(team);
  if (!meta) notFound();
  return <TeamWorkspace teamKey={meta.key} />;
}
