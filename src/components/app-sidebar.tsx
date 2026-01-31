"use client";

import { useState } from "react";
import { 
  Search, 
  Sparkles, 
  PencilRuler, 
  Beaker, 
  LogOut, 
  Box,
  Plus,
  Users,
  Layers,
  History,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Tag,
  Check,
  ChevronDown,
  User,
  Sun,
  Moon,
  CreditCard,
  Activity
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "next-themes";
import { WorkshopSwitcher } from "@/components/workshop-switcher";
import { useWorkshop } from "@/hooks/use-workshop";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Id } from "../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const items = [
  { id: "genshoes", title: "GenShoes", icon: Sparkles },
  { id: "research", title: "Research", icon: Search },
  { id: "schematics", title: "Schematics", icon: PencilRuler },
  { id: "marketing", title: "Marketing", icon: Layers },
  { id: "products", title: "Products", icon: Box },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { activeWorkshopId, activeWorkshopSlug } = useWorkshop();
  const { setTheme, theme } = useTheme();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    navigation: true,
    projects: true,
    workspace: true,
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };
  
  const deleteProject = useMutation(api.projects.deleteProject);
  const renameProject = useMutation(api.projects.renameProject);
  const togglePinProject = useMutation(api.projects.togglePinProject);
  const updateClassification = useMutation(api.projects.updateProjectClassification);
  const createClassification = useMutation(api.projects.createClassification);
  
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");
  const classifications = useQuery(api.projects.getClassifications, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleStartRename = (project: { _id: string; name: string }) => {
    setEditingProjectId(project._id);
    setEditingName(project.name);
  };

  const handleSubmitRename = async () => {
    if (!editingProjectId || !editingName.trim()) return;
    await renameProject({ id: editingProjectId as Id<"projects">, name: editingName.trim() });
    setEditingProjectId(null);
  };

  const handleCreateProject = async () => {
    if (!activeWorkshopSlug) return;
    router.push(`/${activeWorkshopSlug}/genshoes`);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="h-14 flex items-center px-4 border-b border-border">
        <div className="w-full group-data-[collapsible=icon]:hidden">
          <WorkshopSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent className="py-4 space-y-6" data-lenis-prevent>
        {/* Actions Group */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={handleCreateProject}
                  tooltip="New Design"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-bold"
                >
                  <Plus className="size-4" />
                  <span className="text-xs uppercase tracking-widest">New Design</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Navigation Group */}
        <SidebarGroup>
          <SidebarGroupLabel 
            className="text-[10px] uppercase tracking-widest text-neutral-500 px-4 mb-2 cursor-pointer hover:text-white transition-colors flex items-center justify-between"
            onClick={() => toggleGroup('navigation')}
          >
            Navigation
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.navigation && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.navigation && (
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const url = `/${activeWorkshopSlug}/${item.id}`;
                  const isActive = pathname === url;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton 
                        isActive={isActive}
                        onClick={() => router.push(url)}
                        tooltip={item.title}
                        className={cn(
                          "hover:bg-accent transition-all",
                          isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"
                        )}
                      >
                        <item.icon className="size-4" />
                        <span className="text-xs font-medium">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* Projects Group */}
        <SidebarGroup>
          <SidebarGroupLabel 
            className="text-[10px] uppercase tracking-widest text-neutral-500 px-4 mb-2 cursor-pointer hover:text-white transition-colors flex items-center justify-between"
            onClick={() => toggleGroup('projects')}
          >
            Recent Designs
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.projects && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.projects && (
            <SidebarGroupContent>
              <SidebarMenu>
                {projects === undefined ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <Skeleton className="h-8 w-full rounded-md mx-2" />
                    </SidebarMenuItem>
                  ))
                ) : projects.length === 0 ? (
                  <div className="px-4 py-2 text-[10px] text-neutral-600 uppercase tracking-tighter">
                    No designs yet
                  </div>
                ) : (
                  projects.slice(0, 5).map((project) => {
                    const projectUrl = `/${activeWorkshopSlug}/threads/${project.slug}`;
                    const isActive = pathname === projectUrl;
                    
                    return (
                      <SidebarMenuItem key={project._id}>
                        {editingProjectId === project._id ? (
                          <div className="px-2 py-1 flex items-center gap-2 w-full">
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmitRename();
                                if (e.key === 'Escape') setEditingProjectId(null);
                              }}
                              onBlur={handleSubmitRename}
                              className="bg-background border border-primary/50 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        ) : (
                          <>
                            <SidebarMenuButton 
                              isActive={isActive}
                              onClick={() => router.push(projectUrl)}
                              tooltip={project.name}
                              className={cn(
                                "hover:bg-accent transition-all",
                                isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Sparkles className="size-3.5" />
                              <span className="text-xs truncate">{project.name}</span>
                              {project.isPinned && (
                                <Pin className="size-3 ml-auto text-orange-500 fill-orange-500" />
                              )}
                            </SidebarMenuButton>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover>
                                  <MoreHorizontal className="size-4" />
                                  <span className="sr-only">More</span>
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start" className="w-48">
                                <DropdownMenuItem onSelect={() => togglePinProject({ id: project._id })} className="flex items-center gap-2 cursor-pointer">
                                  {project.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                                  <span className="text-xs">{project.isPinned ? 'Unpin' : 'Pin'}</span>
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem onSelect={() => handleStartRename(project)} className="flex items-center gap-2 cursor-pointer">
                                  <Pencil className="size-4" />
                                  <span className="text-xs">Rename</span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                                  Classification
                                </DropdownMenuLabel>
                                {classifications?.map((c) => (
                                  <DropdownMenuItem 
                                    key={c._id} 
                                    onSelect={() => updateClassification({ id: project._id, classificationId: c._id })}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#fff' }} />
                                    <span className="text-xs">{c.name}</span>
                                    {project.classificationId === c._id && <Check className="size-3 ml-auto" />}
                                  </DropdownMenuItem>
                                ))}

                                <DropdownMenuSeparator />
                                
                                <DropdownMenuItem 
                                  onSelect={() => {
                                    setTimeout(() => {
                                      if (confirm("Are you sure you want to delete this design?")) {
                                        deleteProject({ id: project._id });
                                        if (isActive) router.push(`/${activeWorkshopSlug}/products`);
                                      }
                                    }, 100);
                                  }}
                                  className="flex items-center gap-2 cursor-pointer text-destructive hover:text-destructive/90"
                                >
                                  <Trash2 className="size-4" />
                                  <span className="text-xs">Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-border">
        {session && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton 
                    size="lg" 
                    className="hover:bg-accent"
                    tooltip="Account"
                  >
                    <Avatar className="h-6 w-6 border border-border">
                      <AvatarImage src={session.user.image || undefined} alt={session.user.name} />
                      <AvatarFallback className="bg-muted text-[8px] uppercase">
                        {session.user.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-left ml-2">
                      <span className="text-xs font-medium truncate w-32">{session.user.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate w-32">{session.user.email}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-56" sideOffset={12}>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{session.user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                    Theme
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex items-center gap-2">
                    {theme === "dark" ? (
                      <>
                        <Sun className="h-4 w-4" />
                        <span>Light Mode</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4" />
                        <span>Dark Mode</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push(`/${activeWorkshopSlug}/settings/pricing`)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Pricing</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push(`/${activeWorkshopSlug}/settings/usage`)}>
                    <Activity className="mr-2 h-4 w-4" />
                    <span>Usage</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    variant="destructive"
                    onSelect={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/') } })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
