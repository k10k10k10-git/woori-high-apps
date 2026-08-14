"use client";

import { useEffect } from "react";

type SavedBodyState = {
  scrollY: number;
  body: Pick<CSSStyleDeclaration, "overflow" | "position" | "top" | "left" | "right" | "width">;
  htmlOverflow: string;
  htmlScrollBehavior: string;
};

let savedState: SavedBodyState | null = null;

function lockBodyScroll() {
  if (savedState || typeof document === "undefined") return;
  const body = document.body;
  const html = document.documentElement;
  const scrollY = window.scrollY;

  savedState = {
    scrollY,
    body: {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    },
    htmlOverflow: html.style.overflow,
    htmlScrollBehavior: html.style.scrollBehavior,
  };

  html.style.overflow = "hidden";
  html.style.scrollBehavior = "auto";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlockBodyScroll() {
  if (!savedState || typeof document === "undefined") return;
  const state = savedState;
  savedState = null;
  const body = document.body;
  const html = document.documentElement;

  html.style.overflow = state.htmlOverflow;
  body.style.overflow = state.body.overflow;
  body.style.position = state.body.position;
  body.style.top = state.body.top;
  body.style.left = state.body.left;
  body.style.right = state.body.right;
  body.style.width = state.body.width;
  window.scrollTo(0, state.scrollY);
  html.style.scrollBehavior = state.htmlScrollBehavior;
}

/**
 * 기존 모달까지 포함해 aria-modal이 열린 동안 문서 스크롤을 한 곳에서 잠근다.
 * MutationObserver를 쓰므로 새 모달은 별도 body 스타일 조작 없이 같은 계약을 따른다.
 */
export default function ModalScrollManager() {
  useEffect(() => {
    const sync = () => {
      if (document.querySelector('[aria-modal="true"]')) lockBodyScroll();
      else unlockBodyScroll();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal"],
    });

    return () => {
      observer.disconnect();
      unlockBodyScroll();
    };
  }, []);

  return null;
}
