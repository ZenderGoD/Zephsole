'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { handleAuthError } from "@/lib/auth-error-handler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";

type Props = {
  onToggleMode: () => void;
  onPasswordReset: () => void;
};

export function SignInForm({ onToggleMode, onPasswordReset }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (result.error) {
        const status = (result.error as { status?: number })?.status;
        if (status === 403) {
          await authClient.emailOtp.sendVerificationOtp({
            email: normalizedEmail,
            type: "email-verification",
          });
          setShowOtp(true);
          toast.info("Email not verified. Enter OTP code from your inbox.");
          return;
        }
        const parsed = handleAuthError(result.error);
        toast.error(parsed.error);
        return;
      }
      toast.success("Signed in");
      router.push("/studio");
    } catch (error) {
      toast.error(handleAuthError(error).error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (otp.length !== 4) {
      toast.error("Enter 4-digit OTP");
      return;
    }
    setIsLoading(true);
    try {
      const verify = await authClient.emailOtp.verifyEmail({
        email: normalizedEmail,
        otp,
      });
      if (verify.error) {
        toast.error(handleAuthError(verify.error).error);
        return;
      }
      const signIn = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (signIn.error) {
        toast.error(handleAuthError(signIn.error).error);
        return;
      }
      toast.success("Email verified and signed in");
      router.push("/studio");
    } catch (error) {
      toast.error(handleAuthError(error).error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/studio",
    });
  };

  return (
    <Card className="w-full max-w-[420px]">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <CardDescription>Sign in to continue.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          <Icons.google className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>

        <form onSubmit={handleEmailSignIn} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {showOtp && (
          <div className="grid gap-2 border rounded-md p-3">
            <Label htmlFor="signin-otp">Verify email OTP</Label>
            <Input
              id="signin-otp"
              type="text"
              value={otp}
              maxLength={4}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="4-digit code"
            />
            <Button variant="secondary" onClick={handleOtpVerify} disabled={isLoading}>
              Verify and Continue
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 text-center text-sm">
        <button type="button" onClick={onPasswordReset} className="text-primary underline underline-offset-4">
          Forgot password?
        </button>
        <div>
          Don&apos;t have an account?{" "}
          <button type="button" onClick={onToggleMode} className="text-primary underline underline-offset-4">
            Sign up
          </button>
        </div>
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          Back to home
        </Link>
      </CardFooter>
    </Card>
  );
}
