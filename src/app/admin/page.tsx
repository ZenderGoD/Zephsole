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
  Coins,
  Image as ImageIcon,
  Layout,
  LayoutDashboard,
  KeyRound,
  Eye,
  ArrowUpRight,
  ArrowLeft
} from "lucide-react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { H1, P } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AdminTab =
  | "overview"
  | "users"
  | "workspaces"
  | "credits"
  | "fal"
  | "landing"
  | "studio"
  | "showcase";

type AssetTab = "landing" | "studio" | "showcase";

export default function AdminPage() {
  const { data: session, isPending, error } = authClient.useSession();
  const router = useRouter();
  const adminStatus = useQuery(api.admin.currentAdminStatus, session ? {} : "skip");
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

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

  // Wait for authoritative server-side role check from Convex.
  if (adminStatus === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <P className="text-muted-foreground animate-pulse font-mono text-[10px] uppercase tracking-widest">
            Loading Admin Access...
          </P>
        </div>
      </div>
    );
  }

  const isAdmin = adminStatus.isAdmin === true;

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
              <p>ROLE: {adminStatus?.role || "unknown"}</p>
              <p>SERVER_ROLE: {adminStatus?.role || "unknown"}</p>
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

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "workspaces", label: "Workspaces", icon: Layout },
    { id: "credits", label: "Credits", icon: Coins },
    { id: "fal", label: "FAL Keys", icon: KeyRound },
    { id: "landing", label: "Landing", icon: Layout },
    { id: "studio", label: "Studio", icon: ImageIcon },
    { id: "showcase", label: "Showcase", icon: Eye },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-background/50 backdrop-blur-xl flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <ShieldCheck size={20} />
            </div>
            <div className="font-bold tracking-tighter text-xl">Zephsole <span className="text-primary">Admin</span></div>
          </div>
          
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-primary">{session.user.name?.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{session.user.name}</div>
              <div className="text-[10px] font-mono text-primary uppercase tracking-widest">Admin</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Button
            variant="outline"
            className="w-full flex items-center gap-2 justify-start"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} />
            <span>Back to App</span>
          </Button>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-center pt-2">
            ZEPHSOLE_ADMIN_V1.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-10">
        {activeTab === 'overview' && <AdminOverview />}

        {activeTab === 'credits' && <AdminCreditsManager />}
        {activeTab === 'fal' && <AdminFalKeysManager />}
        {activeTab === 'users' && <AdminUsersManager />}
        {activeTab === 'workspaces' && <AdminWorkspacesManager />}

        {(activeTab === "landing" || activeTab === "studio" || activeTab === "showcase") && (
          <AssetManager type={activeTab} />
        )}
        </div>
      </main>
    </div>
  );
}

function AdminOverview() {
  const stats = useQuery(api.admin.getPlatformStats, {});

  return (
    <div className="space-y-6">
      <H1 className="text-3xl font-bold tracking-tight">Platform Analytics</H1>
      
      {!stats ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Total Users</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <Users size={20} className="text-primary" />
                  {stats.totalUsers.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Workspaces</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <Layout size={20} className="text-primary" />
                  {stats.totalWorkshops.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Projects</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <BarChart3 size={20} className="text-primary" />
                  {stats.totalProjects.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Memberships</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <Users size={20} className="text-primary" />
                  {stats.totalMemberships.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Credits Granted</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <Coins size={20} className="text-primary" />
                  {stats.totalCreditsGranted.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Credits Remaining</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2 text-emerald-500">
                  <Coins size={20} />
                  {stats.totalCreditsRemaining.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] uppercase tracking-widest font-mono">Credits Used</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tighter flex items-center gap-2">
                  <Coins size={20} className="text-amber-500" />
                  {stats.totalCreditsUsed.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AdminUsersManager() {
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const users = useQuery(api.admin.listUsersForAdmin, {
    search: search || undefined,
    limit: 150,
  });
  const createUser = useMutation(api.admin.createUser);
  const setRole = useMutation(api.admin.setUserRoleForAdmin);

  const submitCreate = async () => {
    if (!email.trim()) {
      alert("Email is required.");
      return;
    }
    try {
      setIsSubmitting(true);
      const result = await createUser({
        email: email.trim(),
        name: name.trim() || undefined,
        markEmailVerified: true,
      });
      console.log("User created:", result);
      setEmail("");
      setName("");
      // Query will auto-refresh via Convex reactivity
    } catch (error) {
      console.error("Create user error:", error);
      alert("Failed to create user: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Create and manage user roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by email, name, or auth identity"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-[520px] overflow-auto border border-border rounded-xl">
            {!users ? (
              <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">
                No users found. {search && `(Search: "${search}")`}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {users.map((user) => (
                  <div key={user.userDocId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{user.email}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {user.name} | {user.authIdentity}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-[10px] uppercase tracking-widest font-bold",
                        user.role === "admin" ? "text-emerald-400" : "text-muted-foreground",
                      )}>
                        {user.role}
                      </span>
                      {user.role !== "admin" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await setRole({ userEmail: user.email, role: "admin" });
                            } catch (error) {
                              console.error(error);
                              alert("Failed to promote user.");
                            }
                          }}
                        >
                          Make Admin
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create User</CardTitle>
          <CardDescription>Create a user account from admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            placeholder="Name (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button className="w-full" disabled={isSubmitting} onClick={submitCreate}>
            {isSubmitting ? "Creating..." : "Create User"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminWorkspacesManager() {
  const [search, setSearch] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [initialCredits, setInitialCredits] = useState("0");
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<Id<"workshops"> | "">("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("member");
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  const workshops = useQuery(api.admin.listWorkshopsForCredits, {
    search: search || undefined,
    limit: 150,
  });
  const members = useQuery(
    api.admin.listWorkshopMembersForAdmin,
    selectedWorkshopId ? { workshopId: selectedWorkshopId } : "skip",
  );
  const createWorkshop = useMutation(api.admin.createWorkshopForUser);
  const addMember = useMutation(api.admin.addUserToWorkspace);

  const selectedWorkshop = workshops?.find((workshop) => workshop.workshopId === selectedWorkshopId);

  const submitCreateWorkspace = async () => {
    if (!ownerEmail.trim() || !workspaceName.trim()) {
      alert("Owner email and workspace name are required.");
      return;
    }
    try {
      setIsCreating(true);
      const result = await createWorkshop({
        ownerEmail: ownerEmail.trim(),
        workspaceName: workspaceName.trim(),
        initialCredits: Number(initialCredits) || 0,
      });
      setSelectedWorkshopId(result.workshopId);
      setWorkspaceName("");
    } catch (error) {
      console.error(error);
      alert("Failed to create workspace.");
    } finally {
      setIsCreating(false);
    }
  };

  const submitAddMember = async () => {
    if (!selectedWorkshopId) {
      alert("Select a workspace first.");
      return;
    }
    if (!memberEmail.trim()) {
      alert("Member email is required.");
      return;
    }
    try {
      setIsAddingMember(true);
      await addMember({
        workshopId: selectedWorkshopId,
        userEmail: memberEmail.trim(),
        role: memberRole,
      });
      setMemberEmail("");
    } catch (error) {
      console.error(error);
      alert("Failed to add member.");
    } finally {
      setIsAddingMember(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>Create and manage workspace memberships.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search workspace by name, slug, owner"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-[300px] overflow-auto border border-border rounded-xl">
            {!workshops ? (
              <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">Loading workspaces...</div>
            ) : workshops.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">No workspaces found.</div>
            ) : (
              <div className="divide-y divide-border">
                {workshops.map((workspace) => (
                  <button
                    key={workspace.workshopId}
                    type="button"
                    onClick={() => setSelectedWorkshopId(workspace.workshopId)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors",
                      selectedWorkshopId === workspace.workshopId && "bg-primary/10 border-l-2 border-primary",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{workspace.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">/{workspace.slug}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold">{workspace.balance.toLocaleString()} credits</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{workspace.ownerId}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold">Members {selectedWorkshop ? `for ${selectedWorkshop.name}` : ""}</div>
            {!selectedWorkshopId ? (
              <div className="text-xs text-muted-foreground">Select a workspace to view members.</div>
            ) : !members ? (
              <div className="text-xs text-muted-foreground">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-xs text-muted-foreground">No members found.</div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.membershipId} className="text-xs border border-border rounded-lg px-3 py-2">
                    {member.email || member.userId} - {member.role}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Workspace</CardTitle>
            <CardDescription>Create a workspace for an existing user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Owner email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
            />
            <Input
              placeholder="Workspace name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
            <Input
              placeholder="Initial credits (optional)"
              value={initialCredits}
              onChange={(event) => setInitialCredits(event.target.value)}
            />
            <Button className="w-full" disabled={isCreating} onClick={submitCreateWorkspace}>
              {isCreating ? "Creating..." : "Create Workspace"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add User to Workspace</CardTitle>
            <CardDescription>Directly add existing user by email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="User email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant={memberRole === "member" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMemberRole("member")}
              >
                Member
              </Button>
              <Button
                type="button"
                variant={memberRole === "admin" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMemberRole("admin")}
              >
                Admin
              </Button>
            </div>
            <Button
              className="w-full"
              disabled={isAddingMember || !selectedWorkshopId}
              onClick={submitAddMember}
            >
              {isAddingMember ? "Adding..." : "Add to Workspace"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminFalKeysManager() {
  const [name, setName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [weight, setWeight] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const keys = useQuery(api.falKeys.listFalKeysForAdmin, {});
  const health = useQuery(api.falHealth.getFalHealthOverview, {});
  const crons = useQuery(api.falCrons.listFalCrons, {});
  const addFalKey = useMutation(api.falKeys.addFalKey);
  const setEnabled = useMutation(api.falKeys.setFalKeyEnabled);
  const removeFalKey = useMutation(api.falKeys.removeFalKey);
  const runMaintenance = useMutation(api.falHealth.runFalMaintenanceNow);
  const ensureFalCrons = useMutation(api.falCrons.ensureFalCrons);
  const removeFalCron = useMutation(api.falCrons.removeFalCron);

  const submit = async () => {
    if (!name.trim() || !keyValue.trim()) {
      alert("Name and key are required.");
      return;
    }
    try {
      setIsSubmitting(true);
      await addFalKey({
        name: name.trim(),
        key: keyValue.trim(),
        capacity: Math.max(Number(capacity) || 1, 1),
        weight: Math.max(Number(weight) || 1, 1),
        enabled: true,
      });
      setName("");
      setKeyValue("");
      setCapacity("8");
      setWeight("1");
    } catch (e) {
      console.error(e);
      alert("Failed to add FAL key.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>FAL Health</CardTitle>
          <CardDescription>Load freshness and key pool health.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className={cn(
            "text-[10px] uppercase tracking-widest font-bold",
            health?.status === "healthy"
              ? "text-emerald-400"
              : health?.status === "degraded"
                ? "text-amber-400"
                : "text-red-400",
          )}>
            {health?.status ?? "loading"}
          </span>
          <span className="text-xs text-muted-foreground">
            enabled={health?.enabledKeys ?? 0} overloaded={health?.overloadedKeys ?? 0} stale={health?.staleLoadEntries ?? 0}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await runMaintenance({});
              } catch (e) {
                console.error(e);
                alert("Failed to run FAL maintenance.");
              }
            }}
          >
            Run Maintenance
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await ensureFalCrons({});
              } catch (e) {
                console.error(e);
                alert("Failed to ensure FAL cron jobs.");
              }
            }}
          >
            Ensure Cron Jobs
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAL Cron Jobs</CardTitle>
          <CardDescription>Scheduled maintenance and health snapshots.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!crons ? (
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Loading cron jobs...</div>
          ) : crons.length === 0 ? (
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest">No FAL cron jobs configured.</div>
          ) : (
            crons.map((job) => (
              <div key={job.id} className="border border-border rounded-lg p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{job.name || job.id}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {job.schedule.kind === "interval" ? `every ${Math.round(job.schedule.ms / 60000)}m` : job.schedule.cronspec}
                  </div>
                </div>
                {job.name && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      try {
                        await removeFalCron({ name: job.name! });
                      } catch (e) {
                        console.error(e);
                        alert("Failed to remove cron job.");
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>FAL Key Pool</CardTitle>
            <CardDescription>Used by generation pipelines with automatic failover/load balancing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!keys ? (
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading keys...</div>
            ) : keys.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">No DB keys yet. Env keys can still be used.</div>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k._id} className="border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{k.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        capacity={k.capacity} weight={k.weight} activeOps={k.activeOperations}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-[10px] uppercase tracking-widest font-bold", k.enabled ? "text-emerald-400" : "text-muted-foreground")}>
                        {k.enabled ? "enabled" : "disabled"}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setEnabled({ id: k._id, enabled: !k.enabled })}>
                        {k.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => removeFalKey({ id: k._id })}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add FAL Key</CardTitle>
            <CardDescription>Add provider key for resilient generation routing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Name (e.g. fal_a)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Key" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} />
            <Input placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <Input placeholder="Weight" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <Button className="w-full" disabled={isSubmitting} onClick={submit}>
              {isSubmitting ? "Adding..." : "Add Key"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminCreditsManager() {
  const [search, setSearch] = useState("");
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<Id<"workshops"> | "">("");
  const [amount, setAmount] = useState("5");
  const [source, setSource] = useState("platform_admin");
  const [description, setDescription] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workshops = useQuery(api.admin.listWorkshopsForCredits, {
    search: search || undefined,
    limit: 80,
  });
  const grantCredits = useMutation(api.admin.grantCreditsToWorkshop);

  const selectedWorkshop = workshops?.find((w) => w.workshopId === selectedWorkshopId);

  const submitGrant = async () => {
    if (!selectedWorkshopId) {
      alert("Select a workshop first.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert("Enter a valid positive credit amount.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await grantCredits({
        workshopId: selectedWorkshopId,
        amount: parsedAmount,
        source: source || "platform_admin",
        description: description || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      alert(`Credits granted to ${result.workshopName}. New balance: ${result.newBalance}`);
      setDescription("");
    } catch (e) {
      console.error(e);
      alert("Failed to grant credits.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Workshop Credits</CardTitle>
            <CardDescription>Search workshops and inspect active balance before granting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search by workshop name, slug, or owner ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="max-h-[420px] overflow-auto border border-border rounded-xl">
              {!workshops ? (
                <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">Loading workshops...</div>
              ) : workshops.length === 0 ? (
                <div className="p-6 text-xs text-muted-foreground font-mono uppercase tracking-widest">No workshops found.</div>
              ) : (
                <div className="divide-y divide-border">
                  {workshops.map((w) => (
                    <button
                      key={w.workshopId}
                      type="button"
                      onClick={() => setSelectedWorkshopId(w.workshopId)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors",
                        selectedWorkshopId === w.workshopId && "bg-primary/10 border-l-2 border-primary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{w.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">/{w.slug}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold">{w.balance.toLocaleString()} credits</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{w.ownerId}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grant Credits</CardTitle>
            <CardDescription>Admin-only credit top-up operation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Target Workshop</div>
            <div className="rounded-lg border border-border p-3">
              {selectedWorkshop ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{selectedWorkshop.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">/{selectedWorkshop.slug}</div>
                  <div className="text-xs">Current balance: {selectedWorkshop.balance.toLocaleString()}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Pick a workshop from the list.</div>
              )}
            </div>

            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (e.g. 10)" />
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. platform_admin)" />
            <Input value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="Expiry days (optional)" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />

            <Button disabled={isSubmitting || !selectedWorkshopId} onClick={submitGrant} className="w-full">
              {isSubmitting ? "Granting..." : "Grant Credits"}
            </Button>
          </CardContent>
        </Card>
      </div>
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
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
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
