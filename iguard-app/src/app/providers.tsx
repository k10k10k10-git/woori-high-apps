"use client";

import { AuthProvider } from "@/context/AuthContext";
import { UIProvider } from "@/context/UIContext";
import InAppBrowserGuard from "@/components/InAppBrowserGuard";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <InAppBrowserGuard>
      <AuthProvider><UIProvider>{children}</UIProvider></AuthProvider>
    </InAppBrowserGuard>
  );
}
