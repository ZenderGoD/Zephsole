'use client';

import { PRICING_PLANS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { H1, H3, P, Muted } from "@/components/ui/typography";

export default function PricingPage() {
  const { data: session } = authClient.useSession();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [isEnterpriseOpen, setIsEnterpriseOpen] = useState(false);

  // Form State
  const [entityType, setEntityType] = useState<'organization' | 'educational' | 'personal'>('organization');
  const [entityName, setEntityName] = useState("");
  const [website, setWebsite] = useState("");
  const [requirements, setRequirements] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Sync session data when dialog opens
  useEffect(() => {
    if (isEnterpriseOpen && session?.user) {
      // Defer state updates to avoid cascading renders
      setTimeout(() => {
        setName(session.user.name || "");
        setEmail(session.user.email || "");
      }, 0);
    }
  }, [isEnterpriseOpen, session]);

  const handleSubmit = () => {
    // Future: implementation for sending to contacts
    console.log({
      name,
      email,
      entityType,
      entityName,
      website,
      requirements
    });
    setIsEnterpriseOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <H1 className="text-2xl font-light tracking-tighter">Pricing Plans</H1>
          <P className="text-sm text-neutral-500 mt-1">Scale your studio&apos;s intelligence capabilities.</P>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex items-center bg-neutral-900 border border-white/5 rounded-full p-1">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-[0.2em] transition-all",
              billingCycle === 'monthly' 
                ? "bg-white text-black shadow-lg" 
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-[0.2em] transition-all",
              billingCycle === 'annual' 
                ? "bg-white text-black shadow-lg" 
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            Annual
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {PRICING_PLANS.map((plan) => {
          const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
          const monthlyEquivalent = billingCycle === 'annual' ? (plan.annualPrice / 12).toFixed(0) : plan.monthlyPrice;

          return (
            <div key={plan.name} className={cn(
              "p-6 border rounded-2xl transition-all relative overflow-hidden",
              plan.name === "Max" ? "bg-white text-black border-white" : "bg-neutral-900/50 border-white/5 text-white"
            )}>
              {plan.name === "Free" && (
                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] uppercase tracking-widest px-3 py-1 font-bold rounded-bl-lg">
                  New Studios Only
                </div>
              )}
              {plan.name === "Max" && (
                <div className="absolute top-0 right-0 bg-black text-white text-[8px] uppercase tracking-widest px-3 py-1 font-bold rounded-bl-lg">
                  Most Popular
                </div>
              )}
              
              <div className="flex justify-between items-start">
                <div>
                  <H3 className="text-lg font-bold uppercase tracking-widest">{plan.name}</H3>
                  <P className={cn("text-xs mt-1", plan.name === "Max" ? "text-black/60" : "text-neutral-500")}>
                    {plan.description}
                  </P>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light tracking-tighter">
                    {plan.isFree ? "$0" : `$${price}`}
                  </div>
                  {!plan.isFree && (
                    <div className={cn("text-[10px] uppercase tracking-widest", plan.name === "Max" ? "text-black/60" : "text-neutral-500")}>
                      {billingCycle === 'annual' ? `Equivalent to $${monthlyEquivalent}/mo` : 'Per Month'}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-xs">
                    <Check size={14} className={plan.name === "Max" ? "text-black" : "text-emerald-500"} />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className={cn("text-[10px] uppercase tracking-widest font-bold", plan.name === "Max" ? "text-black/60" : "text-neutral-500")}>Credits Included</span>
                  <span className="text-lg font-mono font-bold">{plan.credits.toLocaleString()}</span>
                </div>
                <Button className={cn(
                  "flex-1 text-[10px] uppercase tracking-[0.2em] font-bold h-10",
                  plan.name === "Max" ? "bg-black text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200"
                )}>
                  {plan.name === "Free" ? "Current Plan" : "Upgrade Now"}
                </Button>
              </div>
            </div>
          );
        })}

        {/* Enterprise Plan */}
        <div className="p-6 border border-white/5 rounded-2xl bg-neutral-900/30 text-white flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <H3 className="text-lg font-bold uppercase tracking-widest">Enterprise</H3>
            <P className="text-xs text-neutral-500 mt-1">
              Custom solutions for large scale manufacturing and design teams.
            </P>
          </div>
          <Button 
            variant="outline"
            className="w-full md:w-auto text-[10px] uppercase tracking-[0.2em] font-bold border-white/10 hover:bg-white/5"
            onClick={() => setIsEnterpriseOpen(true)}
          >
            Contact Sales
          </Button>
        </div>
      </div>

      <Dialog open={isEnterpriseOpen} onOpenChange={setIsEnterpriseOpen}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white sm:max-w-[500px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-light tracking-tight">Enterprise Inquiry</DialogTitle>
            <DialogDescription className="text-neutral-500 text-xs">
              Fill out the form below and our team will get back to you shortly.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            {/* Read-only User Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Full Name</Label>
                <div className="px-3 py-2 bg-neutral-900 border border-white/5 rounded-md text-sm text-neutral-400">
                  {name || "Loading..."}
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Work Email</Label>
                <div className="px-3 py-2 bg-neutral-900 border border-white/5 rounded-md text-sm text-neutral-400">
                  {email || "Loading..."}
                </div>
              </div>
            </div>

            {/* Entity Type Selection */}
            <div className="grid gap-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Entity Type</Label>
              <div className="flex gap-2 p-1 bg-neutral-900 border border-white/5 rounded-lg">
                {(['organization', 'educational', 'personal'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEntityType(type)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all",
                      entityType === type 
                        ? "bg-white text-black" 
                        : "text-neutral-500 hover:text-neutral-300"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity Name */}
            <div className="grid gap-2">
              <Label htmlFor="entityName" className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">
                {entityType === 'personal' ? 'Project Name' : entityType === 'educational' ? 'Institute Name' : 'Organization Name'}
              </Label>
              <Input 
                id="entityName" 
                placeholder={
                  entityType === 'personal' ? 'My Creative Studio' : 
                  entityType === 'educational' ? 'Institute Name' : 'Company Inc.'
                } 
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                className="bg-black border-white/10 text-sm focus:border-white/20 transition-all" 
              />
            </div>

            {/* Website */}
            <div className="grid gap-2">
              <Label htmlFor="website" className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Website / Portfolio</Label>
              <Input 
                id="website" 
                placeholder="https://..." 
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="bg-black border-white/10 text-sm focus:border-white/20 transition-all" 
              />
            </div>

            {/* Requirements */}
            <div className="grid gap-2">
              <Label htmlFor="requirements" className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Detailed Requirements</Label>
              <Textarea 
                id="requirements" 
                placeholder="Tell us about your team's specific needs, expected volume, and timeline..." 
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                className="bg-black border-white/10 text-sm min-h-[100px] focus:border-white/20 transition-all" 
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              className="w-full bg-white text-black hover:bg-neutral-200 text-[10px] uppercase tracking-[0.2em] font-bold h-12"
              onClick={handleSubmit}
            >
              Send Inquiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
