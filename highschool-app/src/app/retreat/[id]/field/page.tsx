"use client";

import { AuthProvider as IguardAuthProvider } from "@/features/iguard/context/AuthContext";
import IguardClient from "./IguardClient";

export default function RetreatFieldPage() {
  return (
    <IguardAuthProvider>
      <div className="iguard-scope">
        <IguardClient />
      </div>
    </IguardAuthProvider>
  );
}
