"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { UIProvider } from "@/context/UIContext";
import ModalScrollManager from "@/components/ModalScrollManager";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UIProvider>
          <ModalScrollManager />
          {children}
        </UIProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
