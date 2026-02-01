'use client';

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { 
  Loader2, 
  ShieldCheck, 
  Users, 
  Settings, 
  BarChart3, 
  AlertCircle,
  Plus,
  Trash2,
  Image as ImageIcon,
  Layout,
  LayoutDashboard,
  Eye,
  ArrowUpRight
} from "lucide-react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { H1, P } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const { data: session, isPending, error } = authClient.useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'landing' | 'studio' | 'showcase'>('overview');

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login?callbackUrl=/admin");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <P className="text-muted-foreground animate-pulse font-mono text-[10px] uppercase tracking-widest">
            Verifying Admin Authority...
          </P>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Check if user has admin role
  const isAdmin = session.user.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-destructive/20 bg-destructive/5 shadow-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle size={32} />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Access Restricted</CardTitle>
            <CardDescription className="text-muted-foreground">
              You do not have the required permissions to access the administration console.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="bg-background/50 border border-border rounded-xl p-4 text-xs font-mono text-muted-foreground">
              <p>USER_ID: {session.user.id}</p>
              <p>ROLE: {session.user.role || 'user'}</p>
              <p>STATUS: UNAUTHORIZED</p>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => router.push("/")}
            >
              Return to Safety
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Admin Header */}
      <header className="border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
                <ShieldCheck size={20} />
              </div>
              <div className="font-bold tracking-tighter text-xl">Zephsole <span className="text-primary">Admin</span></div>
            </div>
            
            <nav className="hidden md:flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border">
              {[
                { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                { id: 'landing', label: 'Landing', icon: Layout },
                { id: 'studio', label: 'Studio', icon: ImageIcon },
                { id: 'showcase', label: 'Showcase', icon: Eye },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all",
                    activeTab === tab.id 
                      ? "bg-background text-foreground shadow-sm border border-border" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-bold text-foreground">{session.user.name}</div>
              <div className="text-[8px] font-mono text-primary uppercase tracking-widest">Admin Access Granted</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden">
               {session.user.image ? (
                 <img src={session.user.image} alt={session.user.name} className="w-full h-full object-cover" />
               ) : (
                 <span className="text-[10px] font-bold text-primary">{session.user.name?.charAt(0)}</span>
               )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-10">
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Total Users</CardDescription>
                  <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                    <Users size={20} className="text-primary" />
                    1,284
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Generations</CardDescription>
                  <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                    <BarChart3 size={20} className="text-primary" />
                    42.5k
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase tracking-widest font-mono">System Load</CardDescription>
                  <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                    <Settings size={20} className="text-primary" />
                    12%
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Uptime</CardDescription>
                  <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2 text-emerald-500">
                    99.9%
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <H1 className="text-3xl font-bold tracking-tight mb-6">Management Console</H1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest events across the platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-[10px] font-mono">
                              OP_{i}
                            </div>
                            <div>
                              <div className="text-sm font-medium">New Generation in 'Tech-Runner'</div>
                              <div className="text-[10px] text-muted-foreground font-mono">USER_ID: user_8273... | {i}m ago</div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-[10px] uppercase tracking-widest">Inspect</Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>System Status</CardTitle>
                    <CardDescription>Global infrastructure monitoring</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span>API Latency</span>
                        <span className="text-emerald-500">12ms</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[15%]" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span>GPU Utilization</span>
                        <span className="text-amber-500">74%</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[74%]" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span>Storage (R2)</span>
                        <span className="text-blue-500">2.4 TB</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[42%]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {activeTab !== 'overview' && (
          <AssetManager type={activeTab as any} />
        )}
      </main>

      <footer className="py-6 border-t border-border mt-auto">
        <div className="container mx-auto px-6 flex justify-between items-center text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
          <span>ZEPHSOLE_ADMIN_CORE_V1.0</span>
          <span>© 2026 ZEPHSOLE INC.</span>
        </div>
      </footer>
    </div>
  );
}

function AssetManager({ type }: { type: 'landing' | 'studio' | 'showcase' }) {
  const assets = useQuery(api.siteAssets.listAssets, { type });
  const getUploadUrl = useAction(api.siteAssetsActions.getUploadUrl);
  const saveAsset = useMutation(api.siteAssets.saveAsset);
  const deleteAsset = useMutation(api.siteAssets.deleteAsset);
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      
      const { uploadUrl, objectKey, publicUrl } = await getUploadUrl({
        type,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!response.ok) throw new Error("Upload failed");

      await saveAsset({
        type,
        objectKey,
        url: publicUrl,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });

    } catch (err) {
      console.error(err);
      alert("Error uploading asset");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter capitalize mb-2">{type} Assets</h2>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest">
            Manage images showcased on the {type} section
          </p>
        </div>
        
        <div className="flex gap-4">
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleUpload}
            accept="image/*"
          />
          <Button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rounded-xl h-12 px-6 gap-2"
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Upload Transmission
          </Button>
          <Button variant="outline" className="rounded-xl h-12 px-6 gap-2" asChild>
            <a href={type === 'landing' ? '/' : `/${type}`} target="_blank">
              View Page <ArrowUpRight size={16} />
            </a>
          </Button>
        </div>
      </div>

      {!assets ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="aspect-square rounded-[2rem] bg-muted animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="py-24 border border-dashed border-border rounded-[3rem] flex flex-col items-center justify-center bg-muted/20">
          <ImageIcon size={48} className="text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-mono text-xs">NO ASSETS DETECTED IN ARCHIVE</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {assets.map((asset) => (
            <Card key={asset._id} className="group relative overflow-hidden rounded-[2rem] border-border bg-card hover:border-primary/50 transition-all duration-500 shadow-sm hover:shadow-2xl">
              <div className="aspect-square relative overflow-hidden">
                <img 
                  src={asset.url} 
                  alt={asset.fileName} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                  <div className="w-full flex justify-between items-center">
                    <p className="text-[10px] text-white font-mono truncate max-w-[150px]">{asset.fileName}</p>
                    <button 
                      onClick={() => deleteAsset({ id: asset._id })}
                      className="p-2 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
