'use client';

import { Gift, Share2, Users, CreditCard } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function ReferralsPage() {
  const { data: session } = authClient.useSession();
  const stats = useQuery(api.referrals.getReferralStats, session?.user.id ? { userId: session.user.id } : "skip");

  const referralCode = stats?.referralCode || "...";
  const referralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/r/${referralCode}`
    : `zephsole.ai/r/${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied to clipboard");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Referrals</h1>
        <p className="text-sm text-neutral-500 mt-1">Grow the network and earn intelligence credits.</p>
      </div>
      
      <div className="bg-neutral-900/50 border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white">
          <Gift size={32} />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Give $5, Get Rewards</h3>
          <p className="text-sm text-neutral-500 max-w-sm">
            Earn $5.00 for every 5 designers you bring in, or 10% of their first subscription purchase.
          </p>
        </div>
        
        <div className="w-full max-w-sm flex gap-2">
          <div className="flex-1 bg-black border border-white/10 rounded-lg px-4 flex items-center justify-center font-mono text-xs text-neutral-400 truncate">
            {referralLink}
          </div>
          <Button 
            onClick={handleCopy}
            className="bg-white text-black hover:bg-neutral-200 text-xs font-bold uppercase tracking-widest px-6"
          >
            <Share2 size={14} className="mr-2" />
            Copy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 bg-neutral-900/30 border border-white/5 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500">
            <Users size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats?.totalUses || 0}</div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Total Referrals</div>
          </div>
        </div>
        
        <div className="p-6 bg-neutral-900/30 border border-white/5 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
            <CreditCard size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold">10%</div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Purchase Kickback</div>
          </div>
        </div>
      </div>
    </div>
  );
}
