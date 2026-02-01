'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'gallery';
  const { data: session } = authClient.useSession();

  const isHome = pathname === '/';
  const isAuth = pathname === '/login' || pathname === '/register';
  const isStudio = pathname?.includes('/threads/') || pathname?.includes('/genshoes') || pathname === '/studio';
  const isAdmin = pathname === '/admin';

  if (isAuth || isStudio || isAdmin) return null;

  const handleTabChange = (tab: 'gallery' | 'signal') => {
    if (isHome) {
      const params = new URLSearchParams(searchParams);
      params.set('tab', tab);
      router.push(`/?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/?tab=${tab}`);
    }
  };

  return (
    <>
      {/* Auth Link */}
      <div className="fixed top-6 right-6 z-[100] flex gap-3">
        {session ? (
          <Link 
            href="/studio"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-medium hover:bg-primary/90 transition-colors shadow-lg"
          >
            Go to Studio
          </Link>
        ) : (
          <>
            <Link 
              href="/login"
              className="text-muted-foreground hover:text-foreground px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-background/50 backdrop-blur-md border border-border"
            >
              Sign In
            </Link>
            <Link 
              href="/register"
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-medium hover:bg-primary/90 transition-colors shadow-lg"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>

      {/* Main Navigation */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center bg-background/50 backdrop-blur-md p-1 rounded-full border border-border shadow-lg">
        <button
          onClick={() => handleTabChange('gallery')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            (isHome && activeTab === 'gallery') ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Studio
        </button>
        <button
          onClick={() => handleTabChange('signal')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            (isHome && activeTab === 'signal') ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Signal
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <Link 
          href="/showcase"
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            pathname === '/showcase' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Showcase
        </Link>
        <Link 
          href="/pricing"
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            pathname === '/pricing' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Pricing
        </Link>
        <Link 
          href="/contact"
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            pathname === '/contact' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Contact
        </Link>
      </div>
    </>
  );
}
