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
import { Icons } from "@/components/ui/icons";

type Props = {
  onToggleMode: () => void;
};

export function SignUpForm({ onToggleMode }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const handleEmailSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: normalizedEmail,
        password,
      });
      if (result.error) {
        toast.error(handleAuthError(result.error).error);
        return;
      }
      setShowOtp(true);
      toast.success("Account created. Enter OTP sent to your email.");
    } catch (error) {
      toast.error(handleAuthError(error).error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
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
      toast.success("Account verified");
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
        <CardTitle className="text-2xl font-bold">Create account</CardTitle>
        <CardDescription>Sign up with OTP verification.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          <Icons.google className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>

        <form onSubmit={handleEmailSignUp} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="signup-name">Name</Label>
            <Input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading || showOtp}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading || showOtp}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading || showOtp}
            />
          </div>
          {!showOtp && (
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create account"}
            </Button>
          )}
        </form>

        {showOtp && (
          <div className="grid gap-2 border rounded-md p-3">
            <Label htmlFor="signup-otp">Email OTP</Label>
            <Input
              id="signup-otp"
              type="text"
              value={otp}
              maxLength={4}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="4-digit code"
            />
            <Button onClick={handleVerify} disabled={isLoading}>
              Verify and Continue
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-sm justify-center">
        Already have an account?{" "}
        <button type="button" onClick={onToggleMode} className="ml-1 text-primary underline underline-offset-4">
          Sign in
        </button>
      </CardFooter>
    </Card>
  );
}
