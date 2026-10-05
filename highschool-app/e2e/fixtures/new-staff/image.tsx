import { createElement, type ImgHTMLAttributes } from "react";

// Next 이미지 최적화는 합성 브라우저 범위 밖이다. 실제 로그인·홈 컴포넌트는 유지한다.
export default function Image({ fill, priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  return createElement("img", { ...props, "data-qa-image-fill": fill ? "true" : undefined, "data-qa-image-priority": priority ? "true" : undefined });
}
