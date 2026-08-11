import SemesterClient from "./SemesterClient";

export default async function SemesterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ area?: string; tab?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  return <SemesterClient semesterId={decodeURIComponent(id)} initialArea={query.area === "admin" ? "admin" : "training"} initialTab={query.tab} />;
}
