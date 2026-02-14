'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { handleAuthError } from "@/lib/auth-error-handler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  onBackToSignIn: () => void;
};

export function PasswordResetForm({ onBackToSignIn }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [isLoading, setIsLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "forget-password",
      });
      if (result.error) {
        toast.error(handleAuthError(result.error).error);
        return;
      }
      setStep("confirm");
      toast.success("Reset OTP sent");
    } catch (error) {
      toast.error(handleAuthError(error).error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await authClient.emailOtp.resetPassword({
        email: normalizedEmail,
        otp,
        password: newPassword,
      });
      if (result.error) {
        toast.error(handleAuthError(result.error).error);
        return;
      }

      const signIn = await authClient.signIn.email({
        email: normalizedEmail,
        password: newPassword,
      });
      if (signIn.error) {
        toast.success("Password reset. Please sign in.");
        onBackToSignIn();
        return;
      }
      toast.success("Password reset");
      router.push("/studio");
    } catch (error) {
      toast.error(handleAuthError(error).error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-[420px]">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
        <CardDescription>
          {step === "request" ? "Send reset OTP to your email." : "Enter OTP and new password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "request" ? (
          <form onSubmit={requestReset} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send reset code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-otp">OTP code</Label>
              <Input
                id="reset-otp"
                type="text"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <button type="button" onClick={onBackToSignIn} className="text-sm text-primary underline underline-offset-4">
          Back to sign in
        </button>
      </CardFooter>
    </Card>
  );
}
