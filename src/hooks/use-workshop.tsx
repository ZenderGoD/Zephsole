"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Id } from "../../convex/_generated/dataModel";
import { Workshop } from "@/lib/types";

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
  const { data: session } = authClient.useSession();
  const [activeWorkshopId, setActiveWorkshopId] = useState<Id<"workshops"> | null>(null);
  const [activeWorkshopSlug, setActiveWorkshopSlug] = useState<string | null>(null);
  
  // Reset active workshop when session changes
  useEffect(() => {
    if (session?.user.id) {
      setActiveWorkshopId(null);
      setActiveWorkshopSlug(null);
    }
  }, [session?.user.id]);
  
  const ensurePersonalWorkshop = useMutation(api.workshops.ensurePersonalWorkshop);
  const registerReferral = useMutation(api.referrals.registerReferral);
  const workshops = useQuery(api.workshops.getWorkshops, session?.user.id ? { userId: session.user.id } : "skip");

  useEffect(() => {
    async function initWorkshop() {
      if (session?.user) {
        // Check for referral code in cookies
        const getCookie = (name: string) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
        };

        const referralCode = getCookie("referralCode");

        const id = await ensurePersonalWorkshop({ 
          userId: session.user.id, 
          userName: session.user.name || "User" 
        });

        // If we have a referral code, try to register it
        if (referralCode) {
          await registerReferral({
            referralCode,
            newUserId: session.user.id
          });
          // Clear the cookie so we don't try again
          document.cookie = "referralCode=; Max-Age=0; path=/;";
        }

        if (!activeWorkshopId) {
          setActiveWorkshopId(id as Id<"workshops">);
        }
      }
    }
    initWorkshop();
  }, [session, ensurePersonalWorkshop, registerReferral, activeWorkshopId]);

  // Sync activeWorkshopId and slug with workshops
  useEffect(() => {
    if (workshops && workshops.length > 0) {
      if (!activeWorkshopId) {
        // Defer state updates to avoid cascading renders
        setTimeout(() => {
          setActiveWorkshopId(workshops[0]._id);
          setActiveWorkshopSlug(workshops[0].slug);
        }, 0);
      } else {
        const active = workshops.find(w => w._id === activeWorkshopId);
        if (active) {
          setTimeout(() => {
            setActiveWorkshopSlug(active.slug);
          }, 0);
        }
      }
    }
  }, [workshops, activeWorkshopId]);

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
