"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { UIProvider } from "@/context/UIContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider><AuthProvider><UIProvider>{children}</UIProvider></AuthProvider></ThemeProvider>;
}
