import Link from "next/link";

/**
 * 404.
 *
 * 없으면 Next.js 기본 페이지(검은 배경 + 영어 + 홈 링크 없음)가 그대로 나온다.
 * 카톡으로 공유된 옛 링크나 삭제된 수련회 주소를 누른 사용자가 갇힌다.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
      <div className="card card-body w-full max-w-md text-center">
        <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-semi)", color: "var(--color-text-faint)" }}>
          404
        </div>
        <h1 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-semi)" }}>
          페이지를 찾을 수 없습니다
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          주소가 바뀌었거나 삭제된 수련회일 수 있습니다.
          <br />홈에서 다시 찾아주세요.
        </p>
        <div className="flex justify-center pt-1">
          <Link href="/" className="btn-primary" style={{ minHeight: 44 }}>홈으로</Link>
        </div>
      </div>
    </div>
  );
}
