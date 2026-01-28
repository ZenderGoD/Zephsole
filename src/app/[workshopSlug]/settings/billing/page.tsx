'use client';

import { CreditCard, Plus, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Billing & Invoices</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage payment methods and view transaction history.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold px-2">Payment Methods</h2>
        <div className="p-6 bg-neutral-900/50 border border-white/5 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-neutral-800 rounded flex items-center justify-center border border-white/5">
              <span className="text-[10px] font-bold">VISA</span>
            </div>
            <div>
              <p className="text-sm font-medium">•••• •••• •••• 4242</p>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Expires 12/26</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white text-[10px] uppercase tracking-widest">
            Edit
          </Button>
        </div>
        <Button variant="outline" className="w-full border-dashed border-white/10 hover:border-white/20 text-[10px] uppercase tracking-widest h-12">
          <Plus size={14} className="mr-2" />
          Add Payment Method
        </Button>
      </div>

      <div className="pt-8 space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Invoice History</h2>
          <Button variant="link" className="text-[10px] uppercase tracking-widest text-neutral-600 hover:text-white p-0 h-auto">
            Stripe Portal
            <ExternalLink size={10} className="ml-1" />
          </Button>
        </div>
        <div className="bg-neutral-900/30 border border-white/5 rounded-2xl divide-y divide-white/5">
          {[
            { date: 'Oct 1, 2025', amount: '$29.00', status: 'Paid' },
            { date: 'Sep 1, 2025', amount: '$29.00', status: 'Paid' },
            { date: 'Aug 1, 2025', amount: '$0.00', status: 'Paid' },
          ].map((invoice, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <span className="text-xs text-neutral-400 font-mono">{invoice.date}</span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-medium">{invoice.amount}</span>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[8px] uppercase tracking-widest font-bold">
                  {invoice.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
