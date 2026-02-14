"use client";

import { Check, ChevronsUpDown, Plus, Users, Settings } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";

export function WorkshopSwitcher() {
  const { activeWorkshopId, setActiveWorkshopId, workshops, isLoading, activeWorkshopSlug } = useWorkshop();
  const { data: session } = authClient.useSession();
  const createWorkshop = useMutation(api.workshops.createWorkshop);
  const inviteMember = useMutation(api.workshops.inviteMember);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const activeWorkshop = workshops?.find((w) => w._id === activeWorkshopId);

  // const handleWorkshopChange = (workshop: { _id: Id<"workshops"> }) => {
  //   setActiveWorkshopId(workshop._id);
  //   // When changing workshop, we should probably redirect to its "home" or latest project
  //   // For now, let's just update the ID and the URL will follow if we are in a project page
  //   // But better to redirect to the workshop root if we have one, or just keep it simple.
  // };

  const handleCreateWorkshop = async () => {
    if (!session?.user) return;
    const name = prompt("Enter workshop name:");
    if (name) {
      setIsCreating(true);
      try {
        const id = await createWorkshop({ name });
        setActiveWorkshopId(id as Id<"workshops">);
        const created = workshops?.find((w) => w._id === id);
        if (created?.slug) {
          router.push(`/${created.slug}/research`);
        } else {
          router.push("/studio");
        }
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
        const result = await inviteMember({
          workshopId: activeWorkshopId, 
          email, 
          role: "member" 
        });
        const inviteToken = (result as { token?: string })?.token;
        if (inviteToken) {
          const inviteUrl = `${window.location.origin}/auth/accept-invite?token=${inviteToken}`;
          alert(`Invite created: ${inviteUrl}`);
        } else {
          alert("Invited successfully!");
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to invite member';
        alert(errorMessage);
      }
    }
  };

  if (isLoading || !activeWorkshop) {
    return (
      <Skeleton className="h-9 w-full rounded-md" />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-foreground bg-accent/50 rounded-md hover:bg-accent transition-colors border border-border outline-none">
        <div className="flex items-center gap-2 truncate">
          <div className="flex items-center justify-center w-5 h-5 bg-primary text-primary-foreground rounded text-[10px] font-bold">
            {activeWorkshop.name.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{activeWorkshop.name}</span>
        </div>
        <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" sideOffset={8}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Workshops
        </DropdownMenuLabel>
        {workshops?.map((workshop) => (
          <DropdownMenuItem
            key={workshop._id}
            onSelect={() => {
              setActiveWorkshopId(workshop._id);
              router.push(`/${workshop.slug}/research`);
            }}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <div className="flex items-center justify-center w-5 h-5 bg-muted text-muted-foreground rounded text-[10px] font-medium border border-border">
                {workshop.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-xs">{workshop.name}</span>
            </div>
            {activeWorkshopId === workshop._id && (
              <Check className="w-3 h-3" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setTimeout(() => {
              handleCreateWorkshop();
            }, 100);
          }}
          disabled={isCreating}
          className="flex items-center gap-2 cursor-pointer"
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
          className="flex items-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span className="text-xs">Invite Members</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => router.push(`/${activeWorkshopSlug}/settings/general`)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs">Workshop Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
