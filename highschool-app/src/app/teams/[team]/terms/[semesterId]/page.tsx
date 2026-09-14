import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ team: string; semesterId: string }> }) {
  const { team, semesterId } = await params;
  redirect(`/teams/${encodeURIComponent(team)}/terms/${encodeURIComponent(semesterId)}/overview`);
}
