import SemesterClient from "./SemesterClient";
import { redirect } from "next/navigation";

export default async function SemesterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ area?: string; tab?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  if (query.area === "admin") {
    redirect(`/sunday-ministry${query.tab ? `?tab=${encodeURIComponent(query.tab)}` : ""}`);
  }
  return <SemesterClient semesterId={decodeURIComponent(id)} initialTab={query.tab} />;
}
