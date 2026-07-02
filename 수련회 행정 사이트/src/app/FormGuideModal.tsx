"use client";

interface Props {
  onClose: () => void;
}

export default function FormGuideModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="card p-0 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="구글폼 생성 가이드라인">

        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--color-header-bg)" }}>
          <div>
            <h3 className="font-bold text-white text-base">📋 구글폼 생성 가이드라인</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-primary-light)" }}>앱과 정상 연동되는 폼을 만들기 위한 규칙</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors" aria-label="닫기">×</button>
        </div>

        {/* 콘텐츠 */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 text-sm">

          {/* 섹션 1: A~D 열 순서 */}
          <div>
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold flex-shrink-0">!</span>
              A~D열 순서 — 반드시 이 순서대로
            </h4>
            <div className="rounded-xl overflow-x-auto border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--color-header-bg)" }}>
                    <th className="px-3 py-2 text-left font-semibold w-10" style={{ color: "var(--color-primary-light)" }}>열</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-primary-light)" }}>질문</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-primary-light)" }}>응답값 형식</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { col: "A", q: "타임스탬프", note: "구글폼 자동 생성 — 건드리지 않음", noteColor: "text-slate-400" },
                    { col: "B", q: "이름", note: "질문 문구 무관", noteColor: "text-slate-400" },
                    { col: "C", q: "성별", note: "반드시  남  /  여  (두 글자)", noteColor: "text-orange-600 font-semibold" },
                    { col: "D", q: "몇 부인가요?", note: "반드시  1부  /  2부", noteColor: "text-orange-600 font-semibold" },
                  ].map(row => (
                    <tr key={row.col} className="bg-white hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-bold" style={{ color: "var(--color-primary)" }}>{row.col}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{row.q}</td>
                      <td className={`px-3 py-2.5 ${row.noteColor}`}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
              ⚠ A~D열 앞에 질문을 추가하면 열이 밀려 전체 데이터가 오작동합니다.
            </p>
          </div>

          {/* 섹션 2: E열 이후 키워드 규칙 */}
          <div>
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold flex-shrink-0">E+</span>
              E열 이후 — 순서 무관, 키워드로 자동 인식
            </h4>
            <div className="space-y-2">
              {[
                {
                  keyword: "\"학년\" 포함",
                  desc: "학년 질문",
                  example: "몇 학년인가요? / 학년을 선택해주세요",
                  valueRule: "선택지 형식: 1학년, 2학년, 3학년",
                  color: "blue",
                },
                {
                  keyword: "\"반\" 포함",
                  desc: "반 질문",
                  example: "몇 반인가요? / 반을 선택해주세요",
                  valueRule: "선택지 형식: 1반, 2반 … (선생님 이름 포함도 OK: 3반 (홍길동T))",
                  color: "green",
                },
                {
                  keyword: "\"주민\" 포함",
                  desc: "주민등록번호 (여행자보험 탭용)",
                  example: "주민등록번호를 입력해주세요",
                  valueRule: "단답형 입력, 형식 무관",
                  color: "purple",
                },
                {
                  keyword: "\"기타\" 또는 \"특이\" 포함",
                  desc: "특이사항 (특이사항 탭용)",
                  example: "기타 사항 / 특이사항이 있으면 적어주세요",
                  valueRule: "장문 입력",
                  color: "amber",
                },
                {
                  keyword: "\"디자인\" 포함",
                  desc: "단체티 디자인 선택 (단체티 신청 탭용)",
                  example: "수련회 티셔츠 디자인을 선택해주세요",
                  valueRule: "선택지: 1번, 2번, 3번, 4번",
                  color: "rose",
                },
                {
                  keyword: "\"사이즈\" 포함",
                  desc: "단체티 사이즈 선택 (단체티 신청 탭용)",
                  example: "티셔츠 사이즈를 선택해주세요",
                  valueRule: "선택지: XS(85), S(90), M(95), L(100), XL(105), 2XL(110), 3XL(115)",
                  color: "rose",
                },
              ].map(item => {
                const colorMap: Record<string, { bg: string; text: string; border: string }> = {
                  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
                  green:  { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
                  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
                  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
                  rose:   { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200" },
                };
                const c = colorMap[item.color];
                return (
                  <div key={item.keyword} className={`rounded-lg border ${c.border} ${c.bg} px-4 py-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold font-mono ${c.text}`}>{item.keyword}</span>
                      <span className="text-xs text-slate-500">→ {item.desc}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">질문 예시:</span> {item.example}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="font-medium">응답값:</span> {item.valueRule}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 섹션 3: 분기 폼 안내 */}
          <div>
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-bold flex-shrink-0">↗</span>
              1부 / 2부 분기 폼 사용 시
            </h4>
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-2">
              <p>1부 선택 → &quot;1부용 학년 질문&quot;으로 이동, 2부 선택 → &quot;2부용 학년 질문&quot;으로 이동하는 분기를 사용하면<br/>응답 시트에 <strong>같은 이름의 열이 2개</strong> 생깁니다.</p>
              <div className="rounded-lg overflow-x-auto border border-slate-200 bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">이름</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600">부</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-blue-600">학년① (E열)</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-blue-600">학년② (F열)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-2 py-1.5">김철수</td>
                      <td className="px-2 py-1.5 text-green-600 font-medium">1부</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-800">2학년 ✓</td>
                      <td className="px-2 py-1.5 text-slate-300">(빈칸)</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1.5">이영희</td>
                      <td className="px-2 py-1.5 text-purple-600 font-medium">2부</td>
                      <td className="px-2 py-1.5 text-slate-300">(빈칸)</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-800">1학년 ✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>앱이 빈칸을 자동으로 건너뛰므로 분기 폼도 <span className="text-green-600 font-semibold">정상 동작</span>합니다.</p>
            </div>
          </div>

          {/* 섹션 4: 전체 질문 구성 */}
          <div>
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-bold flex-shrink-0">全</span>
              전체 폼 질문 구성 (처음부터 끝까지)
            </h4>
            <div className="space-y-2 text-xs">
              {[
                { num: 1, title: "타임스탬프", type: "자동 생성", options: null, note: "구글폼이 자동으로 추가 — 건드리지 않음", role: null, tag: null, tagColor: null },
                { num: 2, title: "이름을 입력해주세요", type: "단답형", options: null, note: "질문 문구는 자유", role: "이름 매칭", tag: "필수", tagColor: "red" },
                { num: 3, title: "성별을 선택해주세요", type: "객관식", options: "남 / 여", note: "반드시 두 글자 그대로 사용", role: "조편성·방배정", tag: "필수 ⚠", tagColor: "red" },
                { num: 4, title: "몇 부인가요?", type: "객관식", options: "1부 / 2부", note: "반드시 이 두 선택지만 사용", role: "전체 필터링", tag: "필수 ⚠", tagColor: "red" },
                { num: 5, title: "학년을 선택해주세요", type: "객관식", options: "1학년 / 2학년 / 3학년", note: "제목에 '학년' 포함 필수 · 분기 폼 사용 시 2개 열 생성됨(정상)", role: "조편성·반 명단", tag: "필수 ⚠", tagColor: "red" },
                { num: 6, title: "반을 선택해주세요", type: "객관식", options: "1반 / 2반 / … / 12반", note: "제목에 '반' 포함 필수 · 선생님 이름 포함 가능: 3반 (홍길동T)", role: "조편성·반 명단", tag: "필수 ⚠", tagColor: "red" },
                { num: 7, title: "학생 연락처", type: "단답형", options: null, note: "숫자만 또는 하이픈 포함 무관", role: "카풀·부분참 탭", tag: "선택", tagColor: "slate" },
                { num: 8, title: "부모님 연락처", type: "단답형", options: null, note: "숫자만 또는 하이픈 포함 무관", role: "카풀·부분참 탭", tag: "선택", tagColor: "slate" },
                { num: 9, title: "단체티(굿즈) 구매를 원하시나요?", type: "객관식", options: "예 / 아니오", note: "예 → 디자인 질문으로 이동 · 아니오 → 다음 질문으로 이동", role: "단체티 탭", tag: "선택", tagColor: "rose" },
                { num: 10, title: "수련회 티셔츠 디자인을 선택해주세요", type: "객관식", options: "1번 / 2번 / 3번 / 4번", note: "제목에 '디자인' 포함 필수 · Q9에서 '예' 선택자만 응답", role: "단체티 탭", tag: "선택", tagColor: "rose" },
                { num: 11, title: "티셔츠 사이즈를 선택해주세요", type: "객관식", options: "XS(85) / S(90) / M(95) / L(100) / XL(105) / 2XL(110) / 3XL(115)", note: "제목에 '사이즈' 포함 필수 · Q9에서 '예' 선택자만 응답", role: "단체티 탭", tag: "선택", tagColor: "rose" },
                { num: 12, title: "여행자 보험 가입을 원하시나요?", type: "객관식", options: "예 / 아니오", note: "예 → 주민등록번호 질문으로 이동 · 아니오 → 다음 질문으로 이동", role: "여행자 보험 탭", tag: "선택", tagColor: "teal" },
                { num: 13, title: "주민등록번호를 입력해주세요", type: "단답형", options: null, note: "제목에 '주민' 포함 필수 · Q12에서 '예' 선택자만 응답", role: "여행자 보험 탭", tag: "선택", tagColor: "teal" },
                { num: 14, title: "기타 사항이 있으면 적어주세요", type: "장문형", options: null, note: "제목에 '기타' 또는 '특이' 포함 필수", role: "특이사항 탭", tag: "선택", tagColor: "slate" },
              ].map(q => {
                const tagStyle: Record<string, string> = {
                  red:   "bg-red-100 text-red-700",
                  slate: "bg-slate-100 text-slate-500",
                  rose:  "bg-rose-100 text-rose-700",
                  teal:  "bg-teal-100 text-teal-700",
                };
                const numStyle: Record<string, string> = {
                  red:   "bg-red-50 text-red-600 border-red-200",
                  slate: "bg-slate-50 text-slate-400 border-slate-200",
                  rose:  "bg-rose-50 text-rose-500 border-rose-200",
                  teal:  "bg-teal-50 text-teal-600 border-teal-200",
                };
                const ns = numStyle[q.tagColor ?? "slate"];
                return (
                  <div key={q.num} className="flex gap-2.5 items-start bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors">
                    <span className={`w-5 h-5 rounded-full border text-[10px] flex items-center justify-center font-bold flex-shrink-0 mt-0.5 ${ns}`}>
                      {q.num}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{q.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{q.type}</span>
                        {q.tag && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tagStyle[q.tagColor ?? "slate"]}`}>
                            {q.tag}
                          </span>
                        )}
                        {q.role && (
                          <span className="ml-auto text-slate-400 text-[10px] whitespace-nowrap">{q.role}</span>
                        )}
                      </div>
                      {q.options && (
                        <div className="mt-0.5 text-slate-500">
                          선택지: <span className="font-medium text-slate-700">{q.options}</span>
                        </div>
                      )}
                      {q.note && (
                        <div className="mt-0.5 text-slate-400">{q.note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400 flex items-start gap-1">
              <span>💡</span>
              <span>Q9~11 (단체티), Q12~13 (여행자보험)은 해당 기능 사용 시에만 추가하세요. Q5·Q6은 1부/2부 분기 폼 사용 시 열이 2개 생기지만 앱이 자동으로 처리합니다.</span>
            </p>
          </div>

          {/* 섹션 5: 절대 하지 말 것 */}
          <div>
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold flex-shrink-0">✕</span>
              절대 하지 말아야 할 것
            </h4>
            <div className="space-y-1.5 text-xs">
              {[
                "A~D열 앞에 새 질문 추가",
                "학년 질문 제목에서 '학년' 글자 제거",
                "반 질문 제목에서 '반' 글자 제거",
                "성별 응답값을 '남성/여성', 'M/F' 등으로 변경",
                "부서 응답값을 '1부서', '오전부' 등으로 변경",
              ].map(item => (
                <div key={item} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-700">
                  <span className="text-red-400 font-bold flex-shrink-0">✕</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 bg-slate-50">
          <button onClick={onClose} className="btn-primary w-full justify-center text-sm">확인</button>
        </div>
      </div>
    </div>
  );
}
