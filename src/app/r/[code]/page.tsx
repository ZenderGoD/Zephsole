import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function ReferralRedirect({ params }: { params: { code: string } }) {
  const { code } = params;
  
  const cookieStore = await cookies();
  cookieStore.set("referralCode", code, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  redirect("/register");
}
