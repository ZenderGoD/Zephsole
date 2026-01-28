'use client';

import { Button } from "@/components/ui/button";
import { ShieldCheck, Smartphone, Key } from 'lucide-react';

export default function SecurityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Security</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage your password and account protection.</p>
      </div>

      <div className="space-y-4">
        {[
          { title: 'Two-Factor Authentication', desc: 'Add an extra layer of security to your account.', icon: Smartphone },
          { title: 'Change Password', desc: 'Ensure your account is using a strong, unique password.', icon: Key },
          { title: 'Active Sessions', desc: 'Manage your logged-in devices and sessions.', icon: ShieldCheck },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-neutral-900/50 border border-white/5 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white/5 rounded-lg text-neutral-400">
                <item.icon size={18} />
              </div>
              <div>
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="text-xs text-neutral-500">{item.desc}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-[10px] uppercase tracking-widest h-8">
              Configure
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
