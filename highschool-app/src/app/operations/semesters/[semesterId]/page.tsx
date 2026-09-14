import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ semesterId: string }> }) { const { semesterId } = await params; redirect(`/operations/semesters/${encodeURIComponent(semesterId)}/overview`); }
