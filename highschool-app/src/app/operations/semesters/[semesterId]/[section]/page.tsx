import { notFound } from "next/navigation";
import SemesterClient from "@/app/semester/[id]/SemesterClient";

const TAB_BY_SECTION = {
  overview: "출석",
  applications: "신청",
  placements: "배치",
  attendance: "출석",
  curriculum: "커리큘럼",
  archive: "아카이브",
  settings: "설정",
} as const;

export default async function Page({ params }: { params: Promise<{ semesterId: string; section: string }> }) {
  const { semesterId, section } = await params;
  const tab = TAB_BY_SECTION[section as keyof typeof TAB_BY_SECTION];
  if (!tab) notFound();
  return <SemesterClient semesterId={decodeURIComponent(semesterId)} initialTab={tab} />;
}
