import { Suspense } from "react";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import MeetingsHome from "@/features/meetings/MeetingsHome";

export default function MeetingsPage() {
  return <Suspense fallback={<WorkspaceSkeleton label="회의록을 불러오고 있습니다." rows={3} />}><MeetingsHome /></Suspense>;
}
