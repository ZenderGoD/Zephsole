import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { H1, P, Muted } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Product Agent (hidden preview)",
};

export default function ProductPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full px-6 py-12 flex items-center justify-center">
      <div className="max-w-2xl text-center space-y-4">
        <Muted className="text-xs uppercase tracking-[0.25em]">
          Hidden preview
        </Muted>
        <H1 className="text-3xl font-semibold">Product Agent sandbox</H1>
        <P className="text-muted-foreground">
          The Product Agent (marketing and media execution) is set up here but
          kept off navigation until we are ready to use it. Open this route
          directly when you want to delegate campaigns or asset generation.
        </P>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back to workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
