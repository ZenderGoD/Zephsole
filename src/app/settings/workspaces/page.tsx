'use client';

import { useWorkshop } from "@/hooks/use-workshop";
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';

export default function WorkspacesPage() {
  const { workshops } = useWorkshop();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tighter">Your Workspaces</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage the studios you belong to.</p>
        </div>
        <Button className="bg-white text-black hover:bg-neutral-200 text-xs font-bold uppercase tracking-widest px-6">
          <Plus size={14} className="mr-2" />
          Create
        </Button>
      </div>

      <div className="grid gap-4">
        {workshops?.map((workshop) => (
          <div key={workshop._id} className="flex items-center justify-between p-6 bg-neutral-900/50 border border-white/5 rounded-2xl backdrop-blur-sm">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest">{workshop.name}</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1 uppercase tracking-tighter">ID: {workshop._id}</p>
            </div>
            <Button variant="outline" size="sm" className="text-[10px] uppercase tracking-widest h-8" onClick={() => window.location.href = `/${workshop.slug}/settings/general`}>
              Manage
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
