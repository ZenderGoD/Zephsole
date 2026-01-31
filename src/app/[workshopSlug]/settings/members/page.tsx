'use client';

import { Button } from "@/components/ui/button";
import { UserPlus, MoreVertical, Shield } from 'lucide-react';
import { useWorkshop } from "@/hooks/use-workshop";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { H1, H3, P, Muted } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersPage() {
  const { activeWorkshopId } = useWorkshop();
  const inviteMember = useMutation(api.workshops.inviteMember);
  const members = useQuery(api.workshops.getMembers, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");

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
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to invite member';
        alert(errorMessage);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <H1 className="text-2xl font-light tracking-tighter">Team Members</H1>
          <P className="text-sm text-neutral-500 mt-1">Manage who has access to this design studio.</P>
        </div>
        <Button 
          onClick={handleInvite}
          className="bg-white text-black hover:bg-neutral-200 text-xs font-bold uppercase tracking-widest px-6"
        >
          <UserPlus size={14} className="mr-2" />
          Invite
        </Button>
      </div>

      <div className="space-y-2">
        {members?.map((member) => (
          <div key={member._id} className="flex items-center justify-between p-4 bg-neutral-900/50 border border-white/5 rounded-xl">
            <div className="flex items-center gap-4">
              <Avatar className="h-10 w-10 border border-white/10">
                <AvatarImage src={member.image || undefined} alt={member.name} />
                <AvatarFallback className="bg-neutral-800 text-xs font-bold">
                  {member.name?.split(' ').map((n) => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <H3 className="text-sm font-medium">{member.name}</H3>
                  <span className="px-1.5 py-0.5 bg-white/10 rounded text-[8px] uppercase tracking-widest font-bold">
                    {member.role}
                  </span>
                </div>
                <Muted className="text-xs">{member.email}</Muted>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-neutral-500">
              <MoreVertical size={16} />
            </Button>
          </div>
        ))}
        {!members && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
