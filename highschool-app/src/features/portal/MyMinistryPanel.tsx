"use client";

import Link from "next/link";
import { ArrowRight, CalendarBlank, CheckCircle, MapPin, UsersThree } from "@phosphor-icons/react";
import { canAccessArea, describeRoles, iguardScopeOf, ownSundayTeam } from "./accessPolicy";
import { ministryModulesFor } from "./myPageDashboard";
import { sundayTeamHref, sundayTeamOf } from "./featureCatalog";
import { useMyPageData } from "./useMyPageData";

export default function MyMinistryPanel() {
  const data = useMyPageData();
  const modules = ministryModulesFor(data.roles);
  const sundayTeam = ownSundayTeam(data.roles);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold text-emerald-700">{describeRoles(data.roles)}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">내 사역</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">현재 계정과 유일하게 연결되는 배정만 표시합니다.</p>
      </div>

      {data.loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">일부 정보를 불러오지 못했습니다: {data.loadError}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        {canAccessArea("semester", data.roles) && (
          <section className="mypage-section" aria-labelledby="my-semester-title">
            <div className="mypage-section-header">
              <div>
                <h4 id="my-semester-title">학기 배정</h4>
                <p>{data.currentSemester?.meta.title ?? "현재 학기가 없습니다"}</p>
              </div>
              <Link href={data.currentSemester ? `/semester/${encodeURIComponent(data.currentSemester.id)}` : "/semesters"}>학기 열기 <ArrowRight weight="bold" /></Link>
            </div>
            {data.personalApplication ? (
              <div className="mypage-assignment">
                <div className="mypage-assignment-title">
                  <span><UsersThree weight="duotone" /></span>
                  <div><strong>{data.personalApplication.application.name}</strong><small>{data.personalApplication.application.status}</small></div>
                </div>
                <dl>
                  <div><dt>사역팀</dt><dd>{data.personalApplication.team?.name ?? "미배정"}</dd></div>
                  <div><dt>훈련 반</dt><dd>{data.personalApplication.trainingClass?.name ?? "미배정"}</dd></div>
                  <div><dt>출석</dt><dd>{data.personalAttendance ? `${data.personalAttendance.recorded}/${data.personalAttendance.total}회` : "기록 없음"}</dd></div>
                  <div><dt>출석률</dt><dd>{data.personalAttendance ? `${data.personalAttendance.rate}%` : "0%"}</dd></div>
                </dl>
              </div>
            ) : <UnmatchedState text="현재 계정 이름과 유일하게 연결되는 학기 신청 기록이 없습니다." />}
          </section>
        )}

        {canAccessArea("sunday", data.roles) && (
          <section className="mypage-section" aria-labelledby="my-sunday-title">
            <div className="mypage-section-header">
              <div>
                <h4 id="my-sunday-title">주일 사역</h4>
                <p>역할 정책에 따라 담당 팀과 조회 영역을 표시합니다.</p>
              </div>
            </div>
            {sundayTeam ? (
              <Link href={sundayTeamHref(sundayTeam)} className="mypage-feature-link">
                <span className="mypage-feature-icon"><CalendarBlank weight="duotone" /></span>
                <span className="min-w-0 flex-1"><strong>{sundayTeamOf(sundayTeam)?.label}</strong><small>{sundayTeamOf(sundayTeam)?.tabs.join(" · ") || "팀 기능 준비 중"}</small></span>
                <ArrowRight weight="bold" />
              </Link>
            ) : (
              <div className="mypage-module-grid is-compact">
                {modules.filter((module) => module.tone === "sunday").map((module) => (
                  <Link key={module.id} href={module.href} className="mypage-feature-link">
                    <span className="mypage-feature-icon"><CalendarBlank weight="duotone" /></span>
                    <span className="min-w-0 flex-1"><strong>{module.title}</strong><small>{module.description}</small></span>
                    <ArrowRight weight="bold" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {iguardScopeOf(data.roles) !== "none" && (
        <section className="mypage-section" aria-labelledby="my-retreat-title">
          <div className="mypage-section-header">
            <div>
              <h4 id="my-retreat-title">수련회 현장 배정</h4>
              <p>{data.currentRetreat ? `${data.currentRetreat.year}년 ${data.currentRetreat.name}` : "현재 기준 수련회가 없습니다"}</p>
            </div>
            <Link href={data.currentRetreat ? `/retreat/${encodeURIComponent(data.currentRetreat.id)}/field` : "/field"}>현장 열기 <ArrowRight weight="bold" /></Link>
          </div>
          {data.personalRetreat.matchedStaffId ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,.65fr)_minmax(0,1.35fr)]">
              <div className="mypage-assignment">
                <div className="mypage-assignment-title">
                  <span><MapPin weight="duotone" /></span>
                  <div><strong>{data.personalRetreat.matchedName}</strong><small>현장 스탭 연결됨</small></div>
                </div>
                <dl>
                  <div><dt>담당 조</dt><dd>{data.personalRetreat.groups.length}개</dd></div>
                  <div><dt>큐·포스트</dt><dd>{data.personalRetreat.duties.length}건</dd></div>
                </dl>
                {data.personalRetreat.groups.length > 0 && <p className="mypage-assignment-note">{data.personalRetreat.groups.map((group) => `${group.bu} ${group.name}`).join(", ")}</p>}
              </div>
              <div className="mypage-duty-list">
                {data.personalRetreat.duties.length > 0 ? data.personalRetreat.duties.slice(0, 6).map((duty) => (
                  <div key={duty.blockId}>
                    <time>{duty.day}일차 {duty.start}</time>
                    <span><strong>{duty.scheduleLabel}</strong><small>{[...duty.roles, ...duty.posts].join(" · ")}</small></span>
                  </div>
                )) : <UnmatchedState text="현재 수련회에 배정된 개인 큐와 포스트가 없습니다." />}
              </div>
            </div>
          ) : <UnmatchedState text="동명이거나 연결 후보가 없어 개인 현장 배정을 자동 표시하지 않았습니다." />}
        </section>
      )}

      <section className="mypage-section" aria-labelledby="my-access-title">
        <div className="mypage-section-header"><div><h4 id="my-access-title">내 접근 영역</h4><p>저장 권한과 조회 권한을 구분해 표시합니다.</p></div></div>
        <div className="mypage-module-grid">
          {modules.map((module) => (
            <Link key={module.id} href={module.href} className={`mypage-module mypage-module--${module.tone}`}>
              <span className="min-w-0"><strong>{module.title}</strong><small>{module.description}</small></span>
              <span className="mypage-module-access">{module.accessLabel}</span><ArrowRight weight="bold" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function UnmatchedState({ text }: { text: string }) {
  return <div className="mypage-unmatched"><CheckCircle weight="duotone" /><p>{text}</p></div>;
}
