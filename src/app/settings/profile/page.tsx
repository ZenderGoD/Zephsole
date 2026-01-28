'use client';

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { data: session } = authClient.useSession();

  if (!session) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Profile Settings</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage your public profile and account details.</p>
      </div>

      <div className="flex items-center gap-6 pb-8 border-b border-white/5">
        <Avatar className="h-20 w-20 border border-white/10">
          <AvatarImage src={session.user.image || undefined} alt={session.user.name} />
          <AvatarFallback className="bg-neutral-900 text-xl uppercase">
            {session.user.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="text-[10px] uppercase tracking-widest h-8">
            Change Avatar
          </Button>
          <p className="text-[10px] text-neutral-600 uppercase tracking-tight">JPG, GIF or PNG. Max size 2MB.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="name" className="text-[10px] uppercase tracking-widest text-neutral-500">Full Name</Label>
          <Input 
            id="name" 
            defaultValue={session.user.name} 
            className="bg-neutral-900/50 border-white/5 focus:border-white/20 transition-all"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-neutral-500">Email Address</Label>
          <Input 
            id="email" 
            defaultValue={session.user.email} 
            disabled
            className="bg-neutral-900/50 border-white/5 opacity-50 cursor-not-allowed"
          />
        </div>

        <div className="pt-4">
          <Button className="bg-white text-black hover:bg-neutral-200 text-xs font-bold uppercase tracking-widest px-8">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
