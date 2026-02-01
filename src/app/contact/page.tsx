'use client';

import { Mail, MessageSquare, ArrowRight, Globe } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { H1, P } from "@/components/ui/typography";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background pt-32 pb-20 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20">
        <div>
          <H1 className="text-6xl font-bold tracking-tighter mb-8 leading-[0.9]">
            Connect with the <span className="text-primary italic">Future</span>
          </H1>
          <P className="text-muted-foreground text-lg mb-12 max-w-md">
            Whether you&apos;re an independent designer or an industrial manufacturer, we&apos;re ready to integrate Zephsole into your pipeline.
          </P>

          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="p-4 rounded-2xl bg-muted border border-border">
                <Mail className="text-primary" />
              </div>
              <div>
                <h4 className="font-bold text-sm mb-1 uppercase tracking-widest font-mono">Direct Channel</h4>
                <p className="text-muted-foreground text-sm">intelligence@zephsole.com</p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="p-4 rounded-2xl bg-muted border border-border">
                <Globe className="text-primary" />
              </div>
              <div>
                <h4 className="font-bold text-sm mb-1 uppercase tracking-widest font-mono">HQ</h4>
                <p className="text-muted-foreground text-sm">Virtual Node 01 | Bangalore, India</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <MessageSquare size={120} />
          </div>
          
          <form className="space-y-6 relative z-10">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground pl-1">Ident</label>
                <Input placeholder="Your Name" className="bg-background/50 border-border h-12 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground pl-1">Channel</label>
                <Input placeholder="Email Address" className="bg-background/50 border-border h-12 rounded-xl" />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground pl-1">Subject</label>
              <Input placeholder="Partnership / Support / Inquiry" className="bg-background/50 border-border h-12 rounded-xl" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground pl-1">Payload</label>
              <Textarea placeholder="Describe your request..." className="bg-background/50 border-border min-h-[150px] rounded-xl" />
            </div>

            <Button className="w-full h-14 rounded-2xl font-bold uppercase tracking-widest text-xs group">
              Send Transmission 
              <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-20 text-center">
        <Link href="/" className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 transition-colors">
          Return to Gallery <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
