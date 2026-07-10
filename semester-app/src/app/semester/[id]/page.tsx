import SemesterClient from "./SemesterClient";

export default async function SemesterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SemesterClient semesterId={decodeURIComponent(id)} />;
}
