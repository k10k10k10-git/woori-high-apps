"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { UIProvider } from "@/context/UIContext";
import ModalScrollManager from "@/components/ModalScrollManager";
import { ViewModeProvider } from "@/context/ViewModeContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ViewModeProvider>
        <AuthProvider>
          <UIProvider>
            <ModalScrollManager />
            {children}
          </UIProvider>
        </AuthProvider>
      </ViewModeProvider>
    </ThemeProvider>
  );
}
