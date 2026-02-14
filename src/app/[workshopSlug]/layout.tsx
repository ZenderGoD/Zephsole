"use client";

import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
        <AppSidebar />
        <SidebarInset className="flex-1 relative flex flex-col bg-background border-none!">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
