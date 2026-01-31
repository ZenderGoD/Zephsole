'use client';

import { useParams } from "next/navigation";
import { useWorkshop } from "@/hooks/use-workshop";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { H1, H2, P, Muted } from "@/components/ui/typography";

export default function GeneralSettingsPage() {
  const params = useParams();
  const { workshops } = useWorkshop();
  const workshop = workshops?.find(w => w.slug === params.workshopSlug);

  return (
    <div className="space-y-8">
      <div>
        <H1 className="text-2xl font-light tracking-tighter">Workspace Settings</H1>
        <P className="text-sm text-neutral-500 mt-1">Configure your design studio&apos;s identity and global settings.</P>
      </div>

      <div className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="name" className="text-[10px] uppercase tracking-widest text-neutral-500">Workspace Name</Label>
          <Input 
            id="name" 
            defaultValue={workshop?.name} 
            className="bg-neutral-900/50 border-white/5 focus:border-white/20 transition-all"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="slug" className="text-[10px] uppercase tracking-widest text-neutral-500">Workspace Slug</Label>
          <div className="flex items-center gap-2">
            <div className="px-3 py-2 bg-neutral-900 border border-white/5 rounded-lg text-xs text-neutral-600 font-mono">
              zephsole.ai/
            </div>
            <Input 
              id="slug" 
              defaultValue={workshop?.slug} 
              className="bg-neutral-900/50 border-white/5 focus:border-white/20 transition-all font-mono"
            />
          </div>
        </div>

        <div className="pt-4">
          <Button className="bg-white text-black hover:bg-neutral-200 text-xs font-bold uppercase tracking-widest px-8">
            Update Settings
          </Button>
        </div>

        <div className="pt-12 border-t border-white/5">
          <H2 className="text-sm font-bold uppercase tracking-widest text-red-500">Danger Zone</H2>
          <P className="text-xs text-neutral-500 mt-2">Permanently delete this workspace and all associated projects.</P>
          <Button variant="outline" className="mt-4 border-red-900/50 text-red-500 hover:bg-red-950/20 hover:text-red-400 text-[10px] uppercase tracking-widest">
            Delete Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}
