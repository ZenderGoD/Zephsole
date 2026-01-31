'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  User, 
  Palette, 
  ShieldCheck, 
  LayoutGrid, 
  Mail, 
  Gift, 
  ArrowLeft 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sidebarItems = [
  { id: 'profile', title: 'Profile', icon: User, href: '/settings/profile' },
  { id: 'appearance', title: 'Appearance', icon: Palette, href: '/settings/appearance' },
  { id: 'security', title: 'Security', icon: ShieldCheck, href: '/settings/security' },
  { id: 'workspaces', title: 'Workspaces', icon: LayoutGrid, href: '/settings/workspaces' },
  { id: 'invitations', title: 'Invitations', icon: Mail, href: '/settings/invitations' },
  { id: 'referrals', title: 'Referrals', icon: Gift, href: '/settings/referrals' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans w-full">
      {/* Settings Sidebar */}
      <aside className="w-64 border-r border-border bg-muted/30 flex flex-col">
        <div className="p-6 border-b border-border">
          <button 
            onClick={() => router.push('/studio')}
            className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            Back to App
          </button>
          <h2 className="mt-4 text-xs font-bold uppercase tracking-[0.2em]">Personal Settings</h2>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                  isActive 
                    ? "bg-primary text-primary-foreground font-medium" 
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon size={16} />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-background p-12" data-lenis-prevent>
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
