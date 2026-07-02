/**
 * QA 단위 테스트 — 순수 로직 전수 검사 (임시 파일, 테스트 후 삭제)
 * 실행: npx tsx qa-test.mts
 */
import { parseCSV, parseCSVLine, parseSheetUrl, buildSheetUrl } from "./src/lib/sheetsParser";
import { findStudent, normalizeName, stripSuffix } from "./src/lib/studentMatcher";
import { LATE_REGISTRANT_COLORS } from "./src/lib/constants";
import type { Participant, Student } from "./src/lib/types";

let pass = 0, fail = 0;
const failures: string[] = [];
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; failures.push(`✗ ${name}\n    기대: ${e}\n    실제: ${a}`); }
}

// ═══════════════ 1. CSV 파서 ═══════════════
eq("CSV: 기본 행 분리", parseCSV("a,b\nc,d"), [["a","b"],["c","d"]]);
eq("CSV: 따옴표 안 쉼표", parseCSV('이름,"서울, 강남구"'), [["이름","서울, 강남구"]]);
eq("CSV: 따옴표 안 줄바꿈", parseCSV('a,"줄1\n줄2"\nb,c'), [["a","줄1\n줄2"],["b","c"]]);
eq("CSV: 이스케이프 따옴표", parseCSV('a,"그는 ""안녕"" 이라 했다"'), [["a",'그는 "안녕" 이라 했다']]);
eq("CSV: CRLF", parseCSV("a,b\r\nc,d"), [["a","b"],["c","d"]]);
eq("CSV: CR only", parseCSV("a,b\rc,d"), [["a","b"],["c","d"]]);
eq("CSV: 빈 행 제거", parseCSV("a,b\n\n\nc,d\n"), [["a","b"],["c","d"]]);
eq("CSV: 쉼표만 있는 행도 빈 행 취급", parseCSV("a,b\n,,\nc,d"), [["a","b"],["c","d"]]);
eq("CSV: 마지막 행 개행 없음", parseCSV("a,b\nc,d"), [["a","b"],["c","d"]]);
eq("CSV: 빈 셀 유지", parseCSV("a,,c"), [["a","","c"]]);
eq("CSV: 따옴표 안 CRLF", parseCSV('a,"줄1\r\n줄2"'), [["a","줄1\r\n줄2"]]);
eq("CSVLine: 하위호환", parseCSVLine('x,"y,z",w'), ["x","y,z","w"]);
eq("CSVLine: 빈 문자열", parseCSVLine(""), [""]);

// ═══════════════ 2. 시트 URL 파싱 ═══════════════
eq("URL: #gid", parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC123_-x/edit#gid=456"), { sheetId: "ABC123_-x", sheetGid: "456" });
eq("URL: ?gid", parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC/edit?gid=789"), { sheetId: "ABC", sheetGid: "789" });
eq("URL: gid 없음", parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC/edit?usp=sharing"), { sheetId: "ABC", sheetGid: "" });
eq("URL: 빈 문자열", parseSheetUrl(""), null);
eq("URL: 일반 URL", parseSheetUrl("https://example.com"), null);
eq("URL: 복원", buildSheetUrl("ABC", "456"), "https://docs.google.com/spreadsheets/d/ABC/edit#gid=456");

// ═══════════════ 3. 이름 정규화 ═══════════════
eq("norm: 학번 제거", normalizeName("217이예준"), "이예준");
eq("norm: 공백 제거", normalizeName("전 진"), "전진");
eq("norm: 접미사 유지", normalizeName("232김희서C"), "김희서C");
eq("strip: 대문자 1자 제거", stripSuffix("김희서C"), "김희서");
eq("strip: 소문자는 유지", stripSuffix("김희서c"), "김희서c");
eq("strip: 2글자 미만 보호", stripSuffix("김A"), "김A");
eq("strip: 알파벳 없음", stripSuffix("박지민"), "박지민");
eq("strip: 영어 이름 보호 (BUG-2 수정)", stripSuffix("JOHN"), "JOHN");
eq("strip: 영어 이름 보호 KIM", stripSuffix("KIM"), "KIM");

// ═══════════════ 4. findStudent 매칭 (시나리오 전수) ═══════════════
const S = (id: string, name: string, buNum: number, grade: number, cls: number): Student =>
  ({ id, name, num: 0, grade, class: cls, buNum, birth: "", phone: "010", pPhone: "", addr: "", photo: "", school: "" });
const P = (name: string, bu: string, grade: number, cls: number): Participant =>
  ({ name, gender: "남", grade, class: cls, bu, registeredAt: "" });

const db1: Record<string, Student> = {
  "1_a": S("1_a", "김철수", 1, 2, 3),
  "1_b": S("1_b", "이영희", 1, 1, 1),
  "2_c": S("2_c", "김철수", 2, 3, 5),   // 1부/2부 동명이인
  "1_d": S("1_d", "박지민A", 1, 2, 1),  // 접미사 동명이인
  "1_e": S("1_e", "박지민B", 1, 2, 2),
  "1_f": S("1_f", "215최수아", 1, 3, 4), // DB에 학번 붙은 이름
  "1_g": S("1_g", "한 별", 1, 1, 2),    // DB에 공백 있는 이름
};

eq("매칭: 정확 일치(이름+학년+반)", findStudent(P("김철수","1부",2,3), db1)?.id, "1_a");
eq("매칭: 부서 격리 — 2부 신청은 2부 학생", findStudent(P("김철수","2부",3,5), db1)?.id, "2_c");
eq("매칭: 반 오기재 → 이름+학년 fallback", findStudent(P("이영희","1부",1,9), db1)?.id, "1_b");
eq("매칭: 학년 오기재 → 이름만(유일)", findStudent(P("이영희","1부",3,1), db1)?.id, "1_b");
eq("매칭: 동명이인(타부서 포함) 이름만 → 실패해야 함", findStudent(P("김철수","1부",9,9), db1), undefined);
eq("매칭: 접미사 동명이인 — 반까지 일치", findStudent(P("박지민","1부",2,1), db1)?.id, "1_d");
// BUG-1 수정 검증: 접미사 동명이인 + 반 오기재 → 비결정적 매칭 대신 거부
eq("매칭: 접미사 동명이인+반 오기재 → 매칭 거부", findStudent(P("박지민","1부",2,9), db1), undefined);
const db1rev: Record<string, Student> = { "1_e": db1["1_e"], "1_d": db1["1_d"] };
eq("매칭: DB 순서 반전에도 동일 결과", findStudent(P("박지민","1부",2,9), db1rev), undefined);
eq("매칭: DB 학번 이름 vs 폼 깨끗한 이름", findStudent(P("최수아","1부",3,4), db1)?.id, "1_f");
eq("매칭: DB 공백 이름 vs 폼 붙은 이름", findStudent(P("한별","1부",1,2), db1)?.id, "1_g");
eq("매칭: DB 미등록", findStudent(P("없는사람","1부",1,1), db1), undefined);
eq("매칭: 부서 정보 없음 → 전체 탐색", findStudent(P("이영희","",1,1), db1)?.id, "1_b");
eq("매칭: 학년0 반0 (폼 미기재) → 이름만", findStudent(P("이영희","1부",0,0), db1)?.id, "1_b");

// 동명이인이 같은 부서에 2명
const db2: Record<string, Student> = {
  "1_a": S("1_a", "정다은", 1, 1, 1),
  "1_b": S("1_b", "정다은", 1, 2, 3),
};
eq("매칭: 같은 부서 동명이인 — 학년으로 구분", findStudent(P("정다은","1부",2,3), db2)?.id, "1_b");
eq("매칭: 같은 부서 동명이인 — 정보 없으면 실패", findStudent(P("정다은","1부",0,0), db2), undefined);

// ═══════════════ 5. 색상 상수 ═══════════════
eq("색상: blue 포함", LATE_REGISTRANT_COLORS.has("blue"), true);
eq("색상: green 포함", LATE_REGISTRANT_COLORS.has("green"), true);
eq("색상: purple 포함", LATE_REGISTRANT_COLORS.has("purple"), true);
eq("색상: orange 포함", LATE_REGISTRANT_COLORS.has("orange"), true);
eq("색상: red 제외(취소)", LATE_REGISTRANT_COLORS.has("red"), false);

// ═══════════════ 6. 실폼 시나리오 통합 ═══════════════
const realCSV = `타임스탬프,이름,성별,어느 부서인가요?,몇 학년 인가요?,몇 반 인가요?,기타사항
2026. 6. 1 오후 1:23:45,김철수,남,1부,2학년,3반 (이선생T),
2026. 6. 1 오후 2:00:00,이영희,여,1부,1학년,1반,"알레르기 있음
견과류 주의"
2026. 6. 2 오전 9:10:00,박지민,남,1부,2학년,1반,`;
const rows = parseCSV(realCSV);
eq("통합: 실폼 4행 파싱", rows.length, 4);
eq("통합: 줄바꿈 특이사항 보존", rows[2][6], "알레르기 있음\n견과류 주의");
eq("통합: 반 컬럼에서 숫자 추출 가능 형태", rows[1][5], "3반 (이선생T)");

// ═══════════════ 결과 ═══════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`결과: ${pass} 통과 / ${fail} 실패 (총 ${pass + fail})`);
if (failures.length) { console.log("\n" + failures.join("\n\n")); process.exit(1); }

// ═══════════════ 7. groupDisplayName (조 전역 번호) ═══════════════
import { groupDisplayName } from "./src/lib/groupNumber";
import type { Group } from "./src/lib/types";
const G = (id: string, name: string, bu: string): Group =>
  ({ id, name, bu, teachers: [], leader: "", studentIds: [] });
const groups10: Group[] = [
  ...Array.from({length:10},(_,i)=>G(`a${i}`,`${i+1}조`,"1부")),
  ...Array.from({length:10},(_,i)=>G(`b${i}`,`${i+1}조`,"2부")),
];
eq("조번호: 1부 3조 → 3조", groupDisplayName(G("x","3조","1부"), groups10), "3조");
eq("조번호: 2부 1조 → 11조", groupDisplayName(G("x","1조","2부"), groups10), "11조");
eq("조번호: 2부 10조 → 20조", groupDisplayName(G("x","10조","2부"), groups10), "20조");
eq("조번호: 커스텀 이름 유지", groupDisplayName(G("x","독수리조","2부"), groups10), "독수리조");
eq("조번호: 숫자만(조 없음)도 처리", groupDisplayName(G("x","2","2부"), groups10), "12조");
// 1부가 12개면 2부는 13부터
const groups12: Group[] = [
  ...Array.from({length:12},(_,i)=>G(`a${i}`,`${i+1}조`,"1부")),
  G("b0","1조","2부"),
];
eq("조번호: 1부 12개 → 2부 1조=13조", groupDisplayName(G("x","1조","2부"), groups12), "13조");

console.log("\n[2차 실행 — groupDisplayName 포함]");

console.log(`\n${"═".repeat(50)}`);
console.log(`[최종] 결과: ${pass} 통과 / ${fail} 실패 (총 ${pass + fail})`);
if (failures.length) { console.log("\n" + failures.join("\n\n")); process.exit(1); }
