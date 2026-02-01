'use client';

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { H1, P } from "@/components/ui/typography";
import { PRICING_PLANS } from "@/lib/constants";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background pt-32 pb-20 px-6">
      <div className="max-w-7xl mx-auto text-center mb-20">
        <H1 className="text-5xl font-bold tracking-tighter mb-4">Transparent Intelligence</H1>
        <P className="text-muted-foreground max-w-2xl mx-auto">
          Choose the scale of your creativity. From hobbyist sketches to full manufacturing specs.
        </P>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PRICING_PLANS.map((plan) => (
          <div 
            key={plan.name}
            className={`relative p-8 rounded-3xl border transition-all duration-500 hover:shadow-2xl flex flex-col ${
              plan.name === "Max" 
                ? "bg-primary text-primary-foreground border-primary scale-105 z-10" 
                : "bg-card border-border hover:border-primary/50"
            }`}
          >
            {plan.name === "Max" && (
              <div className="absolute top-0 right-0 bg-black text-white text-[8px] uppercase tracking-widest px-3 py-1 font-bold rounded-bl-lg">
                Most Popular
              </div>
            )}
            
            <div className="mb-8">
              <h3 className="text-sm font-mono uppercase tracking-widest mb-2 opacity-70">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold tracking-tighter">${plan.monthlyPrice}</span>
                {!plan.isFree && <span className="text-sm opacity-70">/mo</span>}
              </div>
              <p className="text-xs opacity-70 min-h-[32px]">{plan.description}</p>
            </div>

            <div className="space-y-4 mb-8 flex-1">
              <div className="flex flex-col mb-4">
                <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">Credits Included</span>
                <span className="text-lg font-mono font-bold">{plan.credits.toLocaleString()}</span>
              </div>
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className={`p-1 rounded-full ${plan.name === "Max" ? "bg-white/20" : "bg-primary/10"}`}>
                    <Check size={12} className={plan.name === "Max" ? "text-white" : "text-primary"} />
                  </div>
                  <span className="text-xs">{feature}</span>
                </div>
              ))}
            </div>

            {/* Session buttons removed */}
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto mt-12 p-8 rounded-3xl border border-dashed border-white/10 bg-neutral-900/30 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-bold uppercase tracking-widest">Enterprise</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Custom solutions for large scale manufacturing and design teams.
          </p>
        </div>
        <Button 
          variant="outline"
          asChild
          className="w-full md:w-auto text-[10px] uppercase tracking-[0.2em] font-bold border-white/10 hover:bg-white/5 h-12 px-8"
        >
          <Link href="/contact">Contact Sales</Link>
        </Button>
      </div>

      <div className="mt-20 text-center">
        <Link href="/" className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 transition-colors">
          Return to Gallery <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
