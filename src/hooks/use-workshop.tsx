"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Id } from "../../convex/_generated/dataModel";
import { Workshop } from "@/lib/types";
import { usePathname, useRouter } from "next/navigation";

interface WorkshopContextType {
  activeWorkshopId: Id<"workshops"> | null;
  activeWorkshopSlug: string | null;
  activeWorkshop: Workshop | null;
  setActiveWorkshopId: (id: Id<"workshops">) => void;
  workshops: Workshop[] | undefined;
  isLoading: boolean;
}

const WorkshopContext = createContext<WorkshopContextType | undefined>(undefined);

export function WorkshopProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [activeWorkshopId, setActiveWorkshopId] = useState<Id<"workshops"> | null>(null);
  const [activeWorkshopSlug, setActiveWorkshopSlug] = useState<string | null>(null);

  const ensurePersonalWorkshop = useMutation(api.workshops.ensurePersonalWorkshop);
  const registerReferral = useMutation(api.referrals.registerReferral);
  const workshops = useQuery(api.workshops.getWorkshops, session?.user.id ? {} : "skip");

  const routeWorkshopSlug = (() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const blockedRoots = new Set([
      "auth",
      "api",
      "login",
      "register",
      "settings",
      "studio",
      "admin",
      "r",
    ]);
    if (blockedRoots.has(segments[0])) return null;
    return segments[0];
  })();

  useEffect(() => {
    async function initWorkshop() {
      if (session?.user) {
        try {
          // Check for referral code in cookies
          const getCookie = (name: string) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(';').shift();
          };

          const referralCode = getCookie("referralCode");

          console.log('Initializing workshop for user:', {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            idType: typeof session.user.id,
            idLength: session.user.id?.length
          });

          try {
            const id = await ensurePersonalWorkshop({ 
              userName: session.user.name || "User" 
            });

            console.log('Workshop created/retrieved:', id);
            
            if (!activeWorkshopId) {
              setActiveWorkshopId(id as Id<"workshops">);
            }
          } catch (error) {
            console.error('Error creating workshop:', error);
            // Don't throw - let the query handle finding workshops
          }

          // If we have a referral code, try to register it
          if (referralCode) {
            try {
              await registerReferral({
                referralCode,
              });
              // Clear the cookie so we don't try again
              document.cookie = "referralCode=; Max-Age=0; path=/;";
            } catch (error) {
              console.error('Error registering referral:', error);
            }
          }
        } catch (error) {
          console.error('Error initializing workshop:', error);
        }
      }
    }
    initWorkshop();
  }, [session, ensurePersonalWorkshop, registerReferral, activeWorkshopId]);

  // Prefer URL slug as source of truth for active workshop.
  useEffect(() => {
    if (workshops && workshops.length > 0) {
      if (routeWorkshopSlug) {
        const routeWorkshop = workshops.find((w) => w.slug === routeWorkshopSlug);
        if (routeWorkshop) {
          if (activeWorkshopId !== routeWorkshop._id) {
            setTimeout(() => setActiveWorkshopId(routeWorkshop._id), 0);
          }
          if (activeWorkshopSlug !== routeWorkshop.slug) {
            setTimeout(() => setActiveWorkshopSlug(routeWorkshop.slug), 0);
          }
          return;
        }
        // Guard against direct navigation to non-member workshop routes.
        if (pathname.startsWith(`/${routeWorkshopSlug}/`)) {
          router.replace("/studio");
          return;
        }
      }

      if (!activeWorkshopId) {
        const first = workshops[0];
        setTimeout(() => {
          setActiveWorkshopId(first._id);
          setActiveWorkshopSlug(first.slug);
        }, 0);
        return;
      }

      const active = workshops.find((w) => w._id === activeWorkshopId);
      if (active) {
        if (activeWorkshopSlug !== active.slug) {
          setTimeout(() => setActiveWorkshopSlug(active.slug), 0);
        }
      } else {
        const first = workshops[0];
        setTimeout(() => {
          setActiveWorkshopId(first._id);
          setActiveWorkshopSlug(first.slug);
        }, 0);
      }
    }
  }, [workshops, activeWorkshopId, activeWorkshopSlug, routeWorkshopSlug, pathname, router]);

  const activeWorkshop = workshops?.find(w => w._id === activeWorkshopId) || null;

  return (
    <WorkshopContext.Provider value={{ 
      activeWorkshopId, 
      activeWorkshopSlug,
      activeWorkshop,
      setActiveWorkshopId, 
      workshops, 
      isLoading: !workshops 
    }}>
      {children}
    </WorkshopContext.Provider>
  );
}

export function useWorkshop() {
  const context = useContext(WorkshopContext);
  if (context === undefined) {
    throw new Error("useWorkshop must be used within a WorkshopProvider");
  }
  return context;
}
