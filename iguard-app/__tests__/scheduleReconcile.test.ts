import { describe, it, expect } from "vitest";
import { reconcileScheduleImport, hashCsv, blockKey } from "@/lib/scheduleReconcile";

type E = { id: string; day: number; start: string; label?: string };
type I = { day: number; start: string; label: string };

describe("reconcileScheduleImport — 재임포트 대조 (동선 보존)", () => {
  it("같은 day__start는 기존 ID를 유지한 채 update로 분류 (동선 보존의 핵심)", () => {
    const existing: E[] = [{ id: "blk_1", day: 1, start: "09:00", label: "옛 기도회" }];
    const imported: I[] = [{ day: 1, start: "09:00", label: "새 기도회" }];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates).toEqual([{ id: "blk_1", imported: imported[0] }]);
    expect(r.creates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  it("시트에만 있는 블록은 create", () => {
    const r = reconcileScheduleImport<E, I>([], [{ day: 1, start: "10:00", label: "집회" }]);
    expect(r.creates).toHaveLength(1);
    expect(r.updates).toHaveLength(0);
  });

  it("앱에만 남은 블록(시트에서 사라짐)은 delete 후보", () => {
    const existing: E[] = [{ id: "blk_x", day: 2, start: "14:00", label: "삭제될 것" }];
    const r = reconcileScheduleImport(existing, [] as I[]);
    expect(r.deletes).toEqual(existing);
    expect(r.updates).toHaveLength(0);
  });

  it("혼합: update 1 + create 1 + delete 1 을 정확히 분류", () => {
    const existing: E[] = [
      { id: "keep", day: 1, start: "09:00" },   // 유지·갱신
      { id: "gone", day: 1, start: "23:00" },   // 시트에서 사라짐 → 삭제
    ];
    const imported: I[] = [
      { day: 1, start: "09:00", label: "갱신" }, // keep 매칭
      { day: 1, start: "12:00", label: "신규" }, // 신규
    ];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates.map(u => u.id)).toEqual(["keep"]);
    expect(r.creates.map(c => c.start)).toEqual(["12:00"]);
    expect(r.deletes.map(d => d.id)).toEqual(["gone"]);
  });

  it("시간이 바뀌면 다른 블록으로 취급 (옛 삭제 + 새 생성)", () => {
    const existing: E[] = [{ id: "blk_1", day: 1, start: "09:00" }];
    const imported: I[] = [{ day: 1, start: "09:30", label: "10분 늦춤" }];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.creates).toHaveLength(1);
    expect(r.deletes.map(d => d.id)).toEqual(["blk_1"]);
    expect(r.updates).toHaveLength(0);
  });

  it("기존 중복 키는 첫 번째만 매칭하고 나머지는 유지(삭제 안 함)", () => {
    const existing: E[] = [
      { id: "dup_a", day: 1, start: "09:00" },
      { id: "dup_b", day: 1, start: "09:00" },
    ];
    const imported: I[] = [{ day: 1, start: "09:00", label: "x" }];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates.map(u => u.id)).toEqual(["dup_a"]);
    expect(r.deletes).toHaveLength(0); // importedKeys에 09:00 있으므로 dup_b도 삭제 대상 아님
  });

  it("옛 파서가 전날로 잘못 옮긴 24시+ 블록을 같은 ID로 다음 논리 일차에 복구", () => {
    const existing: E[] = [{ id: "dawn", day: 1, start: "24:30", label: "간식 및 취침" }];
    const imported: I[] = [{ day: 2, start: "24:30", label: "간식 및 취침" }];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates).toEqual([{ id: "dawn", imported: imported[0] }]);
    expect(r.creates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  it("같은 전날 블록이 현재 시트에도 있으면 새 일차 블록의 마이그레이션 대상으로 쓰지 않는다", () => {
    const existing: E[] = [{ id: "real-day1", day: 1, start: "24:30", label: "간식 및 취침" }];
    const imported: I[] = [
      { day: 1, start: "24:30", label: "간식 및 취침" },
      { day: 2, start: "24:30", label: "간식 및 취침" },
    ];
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates.map(u => u.id)).toEqual(["real-day1"]);
    expect(r.creates).toEqual([imported[1]]);
  });
});

describe("blockKey — 실제 시각 정규 키", () => {
  it("day·start를 1일차 00:00 기준 절대 분으로 정규화", () => {
    expect(blockKey(2, "14:30")).toBe(`t${1440 + 14 * 60 + 30}`); // t2310
    expect(blockKey(1, "09:00")).toBe("t540");
  });

  it("2일차 00:30 ≡ 1일차 24:30 — 같은 실제 시각은 같은 키 (새벽 표기 흡수)", () => {
    expect(blockKey(2, "00:30")).toBe(blockKey(1, "24:30"));
  });

  it("파싱 불가한 start는 폴백(day__start)", () => {
    expect(blockKey(1, "미정")).toBe("1__미정");
  });

  it("정규화 덕분에 표기만 바뀐 새벽 블록은 update로 매칭돼 동선이 보존된다", () => {
    const existing = [{ id: "dawn", day: 2, start: "00:30", label: "간식 및 취침" }];
    const imported = [{ day: 1, start: "24:30", label: "간식 및 취침" }]; // 재임포트 시 정규화된 표기
    const r = reconcileScheduleImport(existing, imported);
    expect(r.updates.map(u => u.id)).toEqual(["dawn"]); // 삭제+생성 아님 → blockId 유지 → 동선 보존
    expect(r.creates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });
});

describe("hashCsv — 스냅샷 어긋남 감지", () => {
  it("같은 내용은 같은 해시", () => {
    expect(hashCsv("구분\t시간\n등록\t09:00")).toBe(hashCsv("구분\t시간\n등록\t09:00"));
  });

  it("내용이 다르면 해시도 다르다", () => {
    expect(hashCsv("등록\t09:00")).not.toBe(hashCsv("등록\t10:00"));
  });

  it("CRLF/CR/LF 줄바꿈 차이·앞뒤 공백은 같은 해시로 정규화", () => {
    expect(hashCsv("a\r\nb")).toBe(hashCsv("a\nb"));
    expect(hashCsv("a\rb")).toBe(hashCsv("a\nb"));
    expect(hashCsv("  a\nb  ")).toBe(hashCsv("a\nb"));
  });

  it("빈 문자열도 안전하게 해시", () => {
    expect(typeof hashCsv("")).toBe("string");
  });
});
