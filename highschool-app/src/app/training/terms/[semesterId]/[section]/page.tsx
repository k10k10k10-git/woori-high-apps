import { notFound } from "next/navigation";
import TrainingTermWorkspace, { type TrainingTermSection } from "@/features/training/TrainingTermWorkspace";

const SECTIONS = new Set<TrainingTermSection>(["overview", "roster", "attendance", "curriculum"]);

export default async function Page({ params }: { params: Promise<{ semesterId: string; section: string }> }) {
  const { semesterId, section } = await params;
  if (!SECTIONS.has(section as TrainingTermSection)) notFound();
  const decodedSemesterId = decodeURIComponent(semesterId);
  return <TrainingTermWorkspace key={decodedSemesterId} semesterId={decodedSemesterId} section={section as TrainingTermSection} />;
}
