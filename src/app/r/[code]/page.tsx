import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function ReferralRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  
  const cookieStore = await cookies();
  cookieStore.set("referralCode", code, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  redirect("/auth?mode=signup");
}
