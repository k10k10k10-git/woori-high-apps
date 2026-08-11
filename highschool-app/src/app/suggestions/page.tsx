import type { Metadata } from "next";
import SuggestionClient from "./SuggestionClient";

export const metadata: Metadata = {
  title: "사이트 건의사항 | 서현고등부",
  robots: { index: false, follow: false },
};

export default function SuggestionsPage() {
  return <SuggestionClient />;
}
