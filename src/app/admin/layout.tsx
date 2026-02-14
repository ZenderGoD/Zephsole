import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getToken } from "@/lib/auth-server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = await getToken();
  if (!token) {
    redirect("/login?callbackUrl=/admin");
  }
  return <>{children}</>;
}
