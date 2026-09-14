import { notFound } from "next/navigation";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import TeamTermWorkspace, { type TeamTermSection } from "@/features/teams/TeamTermWorkspace";

const SECTIONS = new Set<TeamTermSection>(["overview", "roster", "attendance", "curriculum", "records"]);

export default async function Page({ params }: { params: Promise<{ team: string; semesterId: string; section: string }> }) {
  const { team, semesterId, section } = await params;
  const meta = sundayTeamOf(team);
  if (!meta || !SECTIONS.has(section as TeamTermSection)) notFound();
  return <TeamTermWorkspace teamKey={meta.key} semesterId={decodeURIComponent(semesterId)} section={section as TeamTermSection} />;
}
