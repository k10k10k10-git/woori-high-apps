import { lazy, Suspense, type ComponentType } from "react";

// Next 전용 렌더 primitive만 교체한다. 업무 컴포넌트와 권한 분기는 그대로 렌더한다.
export default function dynamic(loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) {
  const Component = lazy(loader);
  return function DynamicFixture(props: Record<string, unknown>) {
    return <Suspense fallback={<p role="status">화면을 불러오는 중입니다…</p>}><Component {...props} /></Suspense>;
  };
}
