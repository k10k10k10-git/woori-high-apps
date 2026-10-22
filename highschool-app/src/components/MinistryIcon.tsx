import type { SVGProps } from "react";

export type MinistryIconName = "teams" | "training" | "retreats" | "meetings" | "operations" | "library";

// Lucian Icons v2.0.13의 정적 SVG를 React/currentColor로 적용.
// MIT © 2026 Lucian. 원본·라이선스: public/notices/lucian-icons.txt
const shapes = {
  teams: <><g><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M17.5 14.6c2.4.6 4 2.6 4 5.9" /></g><path fill="currentColor" fillOpacity=".12" d="M2.5 20.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle fill="currentColor" fillOpacity=".12" cx="9" cy="8" r="3.5" /></>,
  training: <><path fill="currentColor" fillOpacity=".12" d="M12 6.5C10.5 5.3 8.3 4.75 5.5 4.75H3.75v13h1.75c2.8 0 5 .55 6.5 1.75" /><path fill="currentColor" fillOpacity=".12" d="M12 6.5c1.5-1.2 3.7-1.75 6.5-1.75h1.75v13H18.5c-2.8 0-5 .55-6.5 1.75z" /><path d="M12 6.5v13" /></>,
  retreats: <><rect fill="currentColor" fillOpacity=".12" x="3.5" y="5" width="17" height="15.5" rx="2.25" /><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h.01M10.75 14h.01M7.5 17.25h.01M10.75 17.25h.01" /><rect fill="currentColor" stroke="none" x="13.75" y="13.25" width="3.5" height="3.5" rx=".9" /></>,
  meetings: <><path fill="currentColor" fillOpacity=".12" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v4a1 1 0 0 0 1 1h4M8.5 12.5h7M8.5 16h4.5" /></>,
  operations: <><path fill="currentColor" fillOpacity=".12" d="m10.33 5.3.3-2.45h2.74l.3 2.45a6.9 6.9 0 0 1 1.88.79l1.95-1.53 1.94 1.94-1.53 1.95a6.9 6.9 0 0 1 .79 1.88l2.45.3v2.74l-2.45.3a6.9 6.9 0 0 1-.79 1.88l1.53 1.95-1.94 1.94-1.95-1.53a6.9 6.9 0 0 1-1.88.79l-.3 2.45h-2.74l-.3-2.45a6.9 6.9 0 0 1-1.88-.79L6.5 19.44 4.56 17.5l1.53-1.95a6.9 6.9 0 0 1-.79-1.88l-2.45-.3v-2.74l2.45-.3a6.9 6.9 0 0 1 .79-1.88L4.56 6.5 6.5 4.56l1.95 1.53a6.9 6.9 0 0 1 1.88-.79z" /><circle cx="12" cy="12" r="3" /></>,
  library: <><path fill="currentColor" fillOpacity=".12" d="M3 18V6.5a2 2 0 0 1 2-2h3.17a2 2 0 0 1 1.42.59L11 6.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path fill="currentColor" fillOpacity=".12" d="M3 10.5h18V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
};

export default function MinistryIcon({ name, size = 24, ...props }: SVGProps<SVGSVGElement> & { name: MinistryIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{shapes[name]}</svg>;
}
