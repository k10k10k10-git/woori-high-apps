export const SITE_HELP = [
  {
    id: "start", category: "처음 시작", title: "처음 왔어요. 어디서 시작하나요?", keywords: "첫 접속 첫 로그인 신규 스탭 사용법 시작 방법",
    answer: "팀 메뉴에서 담당 팀을 엽니다. 팀 전체 현황에서 현재 학기와 모임을 확인한 뒤 필요한 업무로 이동하세요. 첫 사용 안내는 닫아도 팀 화면에서 다시 열 수 있습니다.",
    href: "/teams", link: "내 팀 찾기",
  },
  {
    id: "weekly", category: "팀·출결", title: "이번 모임 출결과 학기 출석은 어떻게 다른가요?", keywords: "출석 위치 출결 위치 어디 학기 팀 주일 운영 차이",
    answer: "팀의 이번 주 업무에서는 현재 모임 출결과 주일 운영을 진행합니다. 학기 기록에서는 확정 명단, 회차별 출석, 커리큘럼과 누적 기록을 확인합니다. 찬양팀에서 같은 학기·회차·학생으로 연결된 출석은 같은 기록이므로 두 번 입력할 필요가 없습니다.",
    href: "/teams", link: "팀 업무 열기",
  },
  {
    id: "attendance", category: "팀·출결", title: "출결은 어떻게 저장하나요? 실수로 잘못 입력했어요.", keywords: "출석 삭제 출결 삭제 기록 삭제 출석 지우기 출결 지우기 기록 지우기 초기화 출석 수정 결석 수정 출석 저장",
    answer: "찬양팀 모임 출결은 출석 또는 결석을 선택하면 바로 저장합니다. 다른 상태로 바꾸려면 올바른 상태를 다시 선택하세요. 기록 지우기는 출석·결석을 미입력으로 되돌리는 동작이며 확인 후 저장합니다. 다른 출석 화면에서는 그 화면의 저장 버튼과 완료 안내를 확인하세요.",
    href: "/teams/praise", link: "찬양팀 출결 찾기",
  },
  {
    id: "group", category: "팀·출결", title: "담당 조나 학생이 보이지 않아요.", keywords: "학생 안 보임 명단 없음 조 배정 계정 연결 누락",
    answer: "선택한 학기와 모임 날짜, 이름 검색과 조 필터를 먼저 확인하세요. 조 담당자는 연결된 계정과 확정된 조에 따라 담당 학생을 확인합니다. 명단이나 계정 연결이 필요한 경우 담당 팀장 또는 교역자에게 로그인 이메일·팀·모임 날짜를 알려 주세요. 학생이 안 보인다고 결석으로 판단하지 않습니다.",
    href: "/help/feedback", link: "화면 문제 제보하기",
  },
  {
    id: "training", category: "훈련·행사", title: "훈련 기록은 어디에서 확인하나요?", keywords: "훈련 출석 훈련 명단 훈련반 찾기",
    answer: "훈련 메뉴에서 해당 학기를 선택합니다. 훈련반 명단과 회차별 출석·진행 기록은 팀의 사역 출석과 구분됩니다. 훈련 화면에 접근이 제한되면 담당 교역자 또는 행정팀에게 학기 역할을 확인해 달라고 요청하세요.",
    href: "/training", link: "훈련 열기",
  },
  {
    id: "events", category: "훈련·행사", title: "수련회 준비와 현장 업무는 어디서 하나요?", keywords: "수련회 프로그램 준비 행사 행정 이가드 현장 업무",
    answer: "행사 메뉴에서 수련회를 선택합니다. 권한에 따라 준비·행정 화면 또는 현장 업무 화면이 열립니다. 프로그램 준비와 게시된 현장 진행 안내는 목적이 다릅니다. 모든 업무 메뉴가 표시되지만, 권한이 필요한 영역은 접근 안내가 나옵니다. 준비 업무 권한이 필요하면 담당 교역자에게 행사 역할을 확인해 달라고 요청하세요.",
    href: "/events", link: "행사 열기",
  },
  {
    id: "permission", category: "접속·권한", title: "로그인했는데 접근 승인이 필요하다고 나와요.", keywords: "권한 없음 접근 불가 승인 대기 팀 연결 로그인 계정 변경",
    answer: "로그인 계정이 사역에 사용하는 계정인지 먼저 확인하세요. 로그인과 사역 권한 배정은 별개입니다. 메뉴와 탭은 모두 표시되며, ‘권한 필요’가 붙은 업무의 내용은 담당 권한이 있어야 열립니다. 담당 팀장·교역자에게 로그인 이메일과 담당 팀을 알려 주면 통합관리자가 연결 상태를 확인할 수 있습니다. 수련회 현장 접근 요청은 현장 권한용이며 팀·훈련 권한을 대신하지 않습니다.",
    href: "/teams", link: "담당 팀 연결 확인",
  },
  {
    id: "error", category: "접속·권한", title: "불러오지 못했다는 안내가 계속 나와요.", keywords: "권한 오류 접속 오류 로그인 오류 로딩 안 됨 연결 실패 다시 시도",
    answer: "화면의 다시 확인·다시 불러오기 버튼을 먼저 누르세요. 권한 확인 실패는 승인 거절과 다릅니다. 계속 실패하면 화면 주소·발생 시간·로그인 이메일을 담당자에게 전달하거나 문제 제보에 남겨 주세요. 명단이 안 보이는 상태에서 임의로 새 명단을 만들거나 출결을 대신 입력하지 마세요.",
    href: "/help/feedback", link: "문제 제보하기",
  },
  {
    id: "contacts", category: "팀·출결", title: "연락처와 학기 자료는 어디에서 찾나요?", keywords: "전화번호 휴대폰 번호 연락처 문서 파일 자료 검색",
    answer: "팀에서 학기를 열고 명단의 연락처를 확인합니다. 자료 메뉴에서는 접근 가능한 학기의 문서와 파일을 찾을 수 있습니다. 사역 가이드는 연간 흐름과 운영 기준을 설명하고, 이 사용법은 사이트에서 업무를 진행하는 방법을 안내합니다.",
    href: "/library", link: "자료 열기",
  },
] as const;

export function searchSiteHelp(query: string, category: string) {
  const words = query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
  return SITE_HELP.filter((item) => {
    if (category !== "전체" && item.category !== category) return false;
    const text = `${item.title} ${item.answer} ${item.category} ${item.keywords}`.toLocaleLowerCase("ko-KR");
    return words.every((word) => text.includes(word) || text.replace(/\s+/g, "").includes(word));
  });
}
