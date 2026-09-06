/** 회차별로 편집해 저장할 수 있는 첫 모임 안내. 개인 명단은 포함하지 않는다. */
export interface PraiseMeetingGuide {
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  interviewLocation: string;
  preparation: string[];
  roles: PraiseGuideRole[];
  steps: PraiseGuideStep[];
  interviewGuidelines: string[];
  fallbacks: string[];
}

export interface PraiseGuideRole {
  id: string;
  title: string;
  responsibilities: string[];
}

export interface PraiseGuideStep {
  id: string;
  title: string;
  durationMinutes: number;
  instructions: string[];
}

export interface PraiseResource {
  id: string;
  title: string;
  description: string;
  href: `/praise-resources/${string}`;
  format: "PPTX" | "TXT" | "PNG";
  mimeType: string;
  bytes: number;
}
