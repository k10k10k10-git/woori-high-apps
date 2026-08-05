"use client";

import { AuthProvider as IguardAuthProvider } from "@/features/iguard/context/AuthContext";
import FieldHomeClient from "./FieldHomeClient";

export default function FieldHomePage() {
  return (
    <IguardAuthProvider>
      <div className="iguard-scope">
        <FieldHomeClient />
      </div>
    </IguardAuthProvider>
  );
}
