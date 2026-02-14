'use client';

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordResetForm } from "./password-reset-form";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

type Mode = "signIn" | "signUp" | "resetPassword";

export function AuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modeParam = searchParams.get("mode");

  const initialMode = useMemo<Mode>(() => {
    if (modeParam === "signup") return "signUp";
    if (modeParam === "reset") return "resetPassword";
    return "signIn";
  }, [modeParam]);

  const [mode, setMode] = useState<Mode>(initialMode);

  const setQueryMode = (next: "signin" | "signup" | "reset") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", next);
    router.replace(`/auth?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {mode === "signIn" && (
        <SignInForm
          onToggleMode={() => {
            setMode("signUp");
            setQueryMode("signup");
          }}
          onPasswordReset={() => {
            setMode("resetPassword");
            setQueryMode("reset");
          }}
        />
      )}
      {mode === "signUp" && (
        <SignUpForm
          onToggleMode={() => {
            setMode("signIn");
            setQueryMode("signin");
          }}
        />
      )}
      {mode === "resetPassword" && (
        <PasswordResetForm
          onBackToSignIn={() => {
            setMode("signIn");
            setQueryMode("signin");
          }}
        />
      )}
    </div>
  );
}
