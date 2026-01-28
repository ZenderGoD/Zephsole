"use client";

import { Check, ChevronsUpDown, Plus, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkshop } from "@/hooks/use-workshop";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";

export function WorkshopSwitcher() {
  const { activeWorkshopId, setActiveWorkshopId, workshops, isLoading, activeWorkshopSlug } = useWorkshop();
  const { data: session } = authClient.useSession();
  const createWorkshop = useMutation(api.workshops.createWorkshop);
  const inviteMember = useMutation(api.workshops.inviteMember);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const activeWorkshop = workshops?.find((w) => w._id === activeWorkshopId);

  const handleWorkshopChange = (workshop: any) => {
    setActiveWorkshopId(workshop._id);
    // When changing workshop, we should probably redirect to its "home" or latest project
    // For now, let's just update the ID and the URL will follow if we are in a project page
    // But better to redirect to the workshop root if we have one, or just keep it simple.
  };

  const handleCreateWorkshop = async () => {
    if (!session?.user) return;
    const name = prompt("Enter workshop name:");
    if (name) {
      setIsCreating(true);
      try {
        const id = await createWorkshop({ name, ownerId: session.user.id });
        setActiveWorkshopId(id as Id<"workshops">);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleInvite = async () => {
    if (!activeWorkshopId) return;
    const email = prompt("Enter email to invite:");
    if (email) {
      try {
        await inviteMember({ 
          workshopId: activeWorkshopId, 
          email, 
          role: "member" 
        });
        alert("Invited successfully!");
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  if (isLoading || !activeWorkshop) {
    return (
      <div className="h-9 w-full bg-white/5 animate-pulse rounded-md" />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-white bg-white/5 rounded-md hover:bg-white/10 transition-colors border border-white/10 outline-none">
        <div className="flex items-center gap-2 truncate">
          <div className="flex items-center justify-center w-5 h-5 bg-white text-black rounded text-[10px] font-bold">
            {activeWorkshop.name.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{activeWorkshop.name}</span>
        </div>
        <ChevronsUpDown className="w-3 h-3 text-neutral-500 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-neutral-900 border-white/10 text-white" align="start" sideOffset={8}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-neutral-500">
          Workshops
        </DropdownMenuLabel>
        {workshops?.map((workshop) => (
          <DropdownMenuItem
            key={workshop._id}
            onSelect={() => {
              setActiveWorkshopId(workshop._id);
              router.push("/studio");
            }}
            className="flex items-center justify-between cursor-pointer focus:bg-white/5"
          >
            <div className="flex items-center gap-2 truncate">
              <div className="flex items-center justify-center w-5 h-5 bg-neutral-800 text-white rounded text-[10px] font-medium border border-white/10">
                {workshop.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-xs">{workshop.name}</span>
            </div>
            {activeWorkshopId === workshop._id && (
              <Check className="w-3 h-3 text-white" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem
          onSelect={() => {
            setTimeout(() => {
              handleCreateWorkshop();
            }, 100);
          }}
          disabled={isCreating}
          className="flex items-center gap-2 cursor-pointer focus:bg-white/5"
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs">Create Workshop</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTimeout(() => {
              handleInvite();
            }, 100);
          }}
          className="flex items-center gap-2 cursor-pointer focus:bg-white/5"
        >
          <Users className="w-4 h-4" />
          <span className="text-xs">Invite Members</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem
          onSelect={() => router.push(`/${activeWorkshopSlug}/settings/general`)}
          className="flex items-center gap-2 cursor-pointer focus:bg-white/5"
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs">Workshop Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
