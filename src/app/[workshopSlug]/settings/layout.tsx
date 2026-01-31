'use client';

import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { 
  Settings, 
  Users, 
  Tag, 
  Activity, 
  CreditCard,
  ArrowLeft 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkshop } from '@/hooks/use-workshop';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function WorkspaceSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const workshopSlug = params.workshopSlug as string;
  const { workshops } = useWorkshop();
  const activeWorkshop = workshops?.find(w => w.slug === workshopSlug);

  const sidebarItems = [
    { id: 'general', title: 'Workspace', icon: Settings, href: `/${workshopSlug}/settings/general` },
    { id: 'members', title: 'Members', icon: Users, href: `/${workshopSlug}/settings/members` },
    { id: 'pricing', title: 'Pricing', icon: Tag, href: `/${workshopSlug}/settings/pricing` },
    { id: 'usage', title: 'Usage', icon: Activity, href: `/${workshopSlug}/settings/usage` },
    { id: 'billing', title: 'Billing', icon: CreditCard, href: `/${workshopSlug}/settings/billing` },
  ];

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans w-full">
      {/* Settings Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-black flex flex-col">
        <div className="p-6 border-b border-white/5">
          <button 
            onClick={() => router.push(`/${workshopSlug}/research`)}
            className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            Back to Studio
          </button>
          <div className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em]">{activeWorkshop?.name || 'Workspace'}</h2>
            <p className="text-[8px] uppercase tracking-widest text-neutral-600 mt-1">Management Console</p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <nav className="p-4 space-y-1">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                  isActive 
                    ? "bg-white text-black font-medium" 
                    : "text-neutral-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon size={16} />
                {item.title}
              </Link>
            );
          })}
          </nav>
        </ScrollArea>
      </aside>

      {/* Main Content Area */}
      <ScrollArea className="flex-1 bg-neutral-950" data-lenis-prevent>
        <main className="p-12">
          <div className="max-w-2xl mx-auto">
            {children}
          </div>
        </main>
      </ScrollArea>
    </div>
  );
}
