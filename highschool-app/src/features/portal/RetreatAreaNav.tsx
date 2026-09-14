"use client";

import { ClipboardText, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type RetreatAreaKey = "admin" | "programs" | "field";

/**
 * 수련회 업무 영역 전환 — 행정 · 프로그램 준비 · 이가드.
 *
 * 세 화면이 각자 다른 자리에 다른 모양으로 두고 있어서 같은 수련회를 보는데도
 * 이동 방법이 화면마다 달랐다. 여기 하나만 두고 세 헤더가 **제목 바로 오른쪽**에 붙인다.
 * 화면별 도구(검색·큐싯 가져오기·시트 설정)는 이 뒤에 `ml-auto`로 밀어 둔다.
 */
export default function RetreatAreaNav({
  retreatId,
  current,
  adminAllowed,
  fieldAllowed,
  onNavigate,
}: {
  retreatId: string;
  current: RetreatAreaKey;
  adminAllowed: boolean;
  fieldAllowed: boolean;
  /** 미저장 초안 가드가 있는 화면은 여기로 가로채 확인창을 띄운다. */
  onNavigate?: (href: string) => void;
}) {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  const encoded = encodeURIComponent(retreatId);
  const adminHref = `/events/${encoded}/administration`;
  const programsHref = `/events/${encoded}/programs`;
  const fieldHref = `/events/${encoded}/field`;

  // 세 영역은 사용자가 탭처럼 오간다. 보이는 동안 목적지 RSC를 준비해
  // 클릭 뒤 전체 화면 로딩 경계가 먼저 나타나는 시간을 없앤다.
  useEffect(() => {
    if (adminAllowed) {
      router.prefetch(adminHref);
      router.prefetch(programsHref);
    }
    if (fieldAllowed) router.prefetch(fieldHref);
  }, [adminAllowed, adminHref, fieldAllowed, fieldHref, programsHref, router]);

  const items = [
    adminAllowed ? { key: "admin" as const, label: "행정", Icon: UsersThree, href: adminHref } : null,
    adminAllowed ? { key: "programs" as const, label: "프로그램 준비", Icon: ClipboardText, href: programsHref } : null,
    fieldAllowed ? { key: "field" as const, label: "이가드", Icon: ShieldCheck, href: fieldHref } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length < 2) return null;

  return (
    <nav className="retreat-area-nav" aria-label="수련회 업무 영역">
      {items.map(({ key, label, Icon, href }) => {
        const isCurrent = key === current;
        return (
          <button
            key={key}
            type="button"
            aria-current={isCurrent ? "page" : undefined}
            aria-label={label}
            onPointerEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            onClick={() => { if (!isCurrent) navigate(href); }}
          >
            <Icon aria-hidden="true" size={17} weight={isCurrent ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
