import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import authConfig from "../auth.config";
import authSchema from "../betterAuth/schema";

const siteUrl = process.env.SITE_URL || process.env.CONVEX_SITE_URL || "";
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  }
);

const getTrustedOrigins = (): string[] => {
  const origins = new Set<string>();
  if (siteUrl) origins.add(siteUrl);
  // Production domains
  origins.add("https://www.zephsole.com");
  origins.add("https://zephsole.com");
  // Local development
  origins.add("http://localhost:3000");
  origins.add("http://localhost:3001");
  origins.add("http://127.0.0.1:3000");
  origins.add("http://127.0.0.1:3001");
  return Array.from(origins);
};

const getBaseURL = (): string => {
  if (siteUrl) return siteUrl;
  return "http://localhost:3000";
};

const sendVerificationOtpEmail = async (
  email: string,
  otp: string,
  type: "sign-in" | "email-verification" | "forget-password"
) => {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Zephsole <auth@zephsole.com>";
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set; OTP email skipped", { email, type, otp });
    return;
  }

  const subjectMap = {
    "sign-in": "Your Zephsole sign in code",
    "email-verification": "Verify your Zephsole email",
    "forget-password": "Reset your Zephsole password",
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: subjectMap[type],
      html: `<p>Your Zephsole verification code is:</p><h2>${otp}</h2><p>This code expires in 15 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send OTP email: ${response.status} ${body}`);
  }
};

export const createAuthOptions = (
  ctx: GenericCtx<DataModel>
): BetterAuthOptions => ({
  baseURL: getBaseURL(),
  trustedOrigins: getTrustedOrigins(),
  secret: betterAuthSecret,
  database: authComponent.adapter(ctx),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  user: {
    additionalFields: {
      userId: {
        type: "string",
        required: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "",
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      prompt: "select_account",
    },
  },
  plugins: [
    convex({
      authConfig,
      jwksRotateOnTokenGenerationError: true,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        await sendVerificationOtpEmail(email, otp, type);
      },
      otpLength: 4,
      expiresIn: 900,
      sendVerificationOnSignUp: true,
      allowedAttempts: 5,
    }),
  ],
  logger: { disabled: false },
});

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
