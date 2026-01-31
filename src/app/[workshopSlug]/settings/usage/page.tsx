'use client';

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { CREDIT_COSTS } from "@/lib/constants";
import { Zap, Search, Image as ImageIcon, Ruler } from "lucide-react";
import { useWorkshop } from "@/hooks/use-workshop";
import { api } from "../../../../../convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { H1, H2, P } from "@/components/ui/typography";

export default function UsagePage() {
  const { activeWorkshop, activeWorkshopId } = useWorkshop();

  const creditBalance = useQuery(
    api.credits.getAvailableCredits,
    activeWorkshopId ? { workshopId: activeWorkshopId } : "skip"
  );

  const redemptions = useQuery(
    api.credits.listRedemptions,
    activeWorkshopId ? { workshopId: activeWorkshopId, limit: 50 } : "skip"
  );

  interface RedemptionRow {
    id: string;
    type: string;
    description: string;
    amount: number;
    project: string;
    date: string;
  }

  const rows = useMemo((): RedemptionRow[] => {
    if (!redemptions) return [];
    return redemptions.map((r) => ({
      id: r._id,
      type: r.assetType || "other",
      description: r.description || "Usage",
      amount: r.amount,
      project: r.projectName || (r.projectId ? "Project" : "—"),
      date: new Date(r.usageAt).toLocaleString(),
    }));
  }, [redemptions]);
  
  return (
    <div className="space-y-8">
      <div>
        <H1 className="text-2xl font-light tracking-tighter">Usage & Credits</H1>
        <P className="text-sm text-neutral-500 mt-1">Monitor your studio&apos;s consumption and intelligence credits.</P>
      </div>

      <div className="p-8 bg-neutral-900 border border-white/10 rounded-3xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-neutral-500 text-[10px] uppercase tracking-widest font-bold mb-2">
              <Zap size={12} className="text-orange-500 fill-orange-500" />
              Available Credits
            </div>
            <div className="text-5xl font-light tracking-tighter">
              {creditBalance?.balance !== undefined ? creditBalance.balance.toLocaleString() : "..."}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Current Workshop</p>
            <div className="text-sm font-medium">{activeWorkshop?.name || "Loading..."}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold px-2">Credit Costing Matrix</H2>
        <div className="grid gap-2">
          {[
            { icon: Search, label: 'Research Query', cost: CREDIT_COSTS.RESEARCH_QUERY },
            { icon: ImageIcon, label: 'Nano Banana (Basic)', cost: CREDIT_COSTS.IMAGE_GENERATION_BASIC },
            { icon: ImageIcon, label: 'Nano Banana Pro (Fidelity)', cost: CREDIT_COSTS.IMAGE_GENERATION_PRO },
            { icon: Ruler, label: 'Technical Draft Gen', cost: CREDIT_COSTS.TECHNICAL_DRAFT_GEN },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-neutral-900/30 border border-white/5 rounded-xl">
              <div className="flex items-center gap-3">
                <item.icon size={14} className="text-neutral-500" />
                <span className="text-sm">{item.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold font-mono">{item.cost}</span>
                <span className="text-[8px] uppercase text-neutral-600 font-bold tracking-widest">Credits</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <H2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Recent credit usage</H2>
          <span className="text-[10px] text-neutral-500">
            {rows.length} entries
          </span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-neutral-900/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right pr-4">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-neutral-500">
                    No credit usage yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="capitalize">{row.type}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>{row.project}</TableCell>
                    <TableCell className="text-right font-mono pr-4">{row.amount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
