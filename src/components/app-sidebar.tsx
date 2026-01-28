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
  User
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
import { WorkshopSwitcher } from "@/components/workshop-switcher";
import { useWorkshop } from "@/hooks/use-workshop";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const items = [
  { id: "research", title: "Market Intelligence", icon: Search },
  { id: "ideation", title: "Visual Ideation", icon: Sparkles },
  { id: "technical", title: "Technical Drafting", icon: PencilRuler },
  { id: "material", title: "Material Science", icon: Beaker },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { activeWorkshopId, activeWorkshopSlug } = useWorkshop();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    intelligence: true,
    projects: true,
    workspace: true,
    library: true,
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };
  
  const createProject = useMutation(api.projects.createProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const renameProject = useMutation(api.projects.renameProject);
  const togglePinProject = useMutation(api.projects.togglePinProject);
  const updateClassification = useMutation(api.projects.updateProjectClassification);
  const createClassification = useMutation(api.projects.createClassification);
  
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");
  const classifications = useQuery(api.projects.getClassifications, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");

  const handleCreateProject = async () => {
    if (!session?.user || !activeWorkshopId || !activeWorkshopSlug) return;
    const name = prompt("Enter project name:", "Untitled Prototype");
    if (name) {
      const slug = await createProject({
        name,
        workshopId: activeWorkshopId,
        userId: session.user.id
      });
      router.push(`/${activeWorkshopSlug}/threads/${slug}`);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5 bg-black">
      <SidebarHeader className="h-14 flex items-center px-4 border-b border-white/5">
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
                  tooltip="New Project"
                  className="bg-white text-black hover:bg-neutral-200 transition-all font-bold"
                >
                  <Plus className="size-4" />
                  <span className="text-xs uppercase tracking-widest">New Project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Intelligence Group */}
        <SidebarGroup>
          <SidebarGroupLabel 
            className="text-[10px] uppercase tracking-widest text-neutral-500 px-4 mb-2 cursor-pointer hover:text-white transition-colors flex items-center justify-between"
            onClick={() => toggleGroup('intelligence')}
          >
            Intelligence
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.intelligence && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.intelligence && (
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const url = `/intelligence/${item.id}`;
                  const isActive = pathname === url;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton 
                        isActive={isActive}
                        onClick={() => router.push(url)}
                        tooltip={item.title}
                        className={cn(
                          "hover:bg-white/5 transition-all",
                          isActive ? "bg-white text-black hover:bg-white/90" : "text-neutral-400"
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

        {/* Management Group */}
        <SidebarGroup>
          <SidebarGroupLabel 
            className="text-[10px] uppercase tracking-widest text-neutral-500 px-4 mb-2 cursor-pointer hover:text-white transition-colors flex items-center justify-between"
            onClick={() => toggleGroup('workspace')}
          >
            Workspaces
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.workspace && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.workspace && (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Collaboration" className="hover:bg-white/5 transition-all text-neutral-400 hover:text-white">
                    <Users className="size-4" />
                    <span className="text-xs font-medium">Project Team</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    isActive={pathname === `/${activeWorkshopSlug}/classifications`}
                    onClick={() => router.push(`/${activeWorkshopSlug}/classifications`)}
                    tooltip="Project Types" 
                    className={cn(
                      "hover:bg-white/5 transition-all",
                      pathname === `/${activeWorkshopSlug}/classifications` ? "bg-white text-black hover:bg-white/90" : "text-neutral-400 hover:text-white"
                    )}
                  >
                    <Layers className="size-4" />
                    <span className="text-xs font-medium">Classifications</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* History/Archive Group */}
        <SidebarGroup>
          <SidebarGroupLabel 
            className="text-[10px] uppercase tracking-widest text-neutral-500 px-4 mb-2 cursor-pointer hover:text-white transition-colors flex items-center justify-between"
            onClick={() => toggleGroup('library')}
          >
            Library
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.library && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.library && (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="All Generations" className="hover:bg-white/5 transition-all text-neutral-400 hover:text-white">
                    <History className="size-4" />
                    <span className="text-xs font-medium">Generations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    isActive={pathname === `/${activeWorkshopSlug}/board`}
                    onClick={() => router.push(`/${activeWorkshopSlug}/board`)}
                    tooltip="Canvas View" 
                    className={cn(
                      "hover:bg-white/5 transition-all",
                      pathname === `/${activeWorkshopSlug}/board` ? "bg-white text-black hover:bg-white/90" : "text-neutral-400"
                    )}
                  >
                    <LayoutGrid className="size-4" />
                    <span className="text-xs font-medium">Collective Board</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
            Projects
            <ChevronDown className={cn("size-3 transition-transform duration-200", !expandedGroups.projects && "-rotate-90")} />
          </SidebarGroupLabel>
          {expandedGroups.projects && (
            <SidebarGroupContent>
              <SidebarMenu>
                {projects === undefined ? (
                  // Loading states
                  Array.from({ length: 3 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="h-8 w-full bg-white/5 animate-pulse rounded-md mx-2" />
                    </SidebarMenuItem>
                  ))
                ) : projects.length === 0 ? (
                  <div className="px-4 py-2 text-[10px] text-neutral-600 uppercase tracking-tighter">
                    No projects yet
                  </div>
                ) : (
                  projects.map((project) => {
                    const projectUrl = `/${activeWorkshopSlug}/threads/${project.slug}`;
                    const isActive = pathname === projectUrl;
                    
                    return (
                      <SidebarMenuItem key={project._id}>
                        <SidebarMenuButton 
                          isActive={isActive}
                          onClick={() => router.push(projectUrl)}
                          tooltip={project.name}
                          className={cn(
                            "hover:bg-white/5 transition-all",
                            isActive ? "bg-white/10 text-white font-medium" : "text-neutral-500 hover:text-neutral-300"
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
                          <DropdownMenuContent side="right" align="start" className="w-48 bg-neutral-900 border-white/10 text-white">
                            <DropdownMenuItem onSelect={() => togglePinProject({ id: project._id })} className="flex items-center gap-2 cursor-pointer focus:bg-white/5">
                              {project.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                              <span className="text-xs">{project.isPinned ? 'Unpin' : 'Pin'}</span>
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onSelect={() => {
                              setTimeout(() => {
                                const newName = prompt("Rename Project", project.name);
                                if (newName && newName !== project.name) renameProject({ id: project._id, name: newName });
                              }, 100);
                            }} className="flex items-center gap-2 cursor-pointer focus:bg-white/5">
                              <Pencil className="size-4" />
                              <span className="text-xs">Rename</span>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator className="bg-white/5" />
                            
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-neutral-500 px-2 py-1.5">
                              Classification
                            </DropdownMenuLabel>
                            {classifications?.map((c) => (
                              <DropdownMenuItem 
                                key={c._id} 
                                onSelect={() => updateClassification({ id: project._id, classificationId: c._id })}
                                className="flex items-center gap-2 cursor-pointer focus:bg-white/5"
                              >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#fff' }} />
                                <span className="text-xs">{c.name}</span>
                                {project.classificationId === c._id && <Check className="size-3 ml-auto" />}
                              </DropdownMenuItem>
                            ))}

                            <DropdownMenuSeparator className="bg-white/5" />
                            
                            <DropdownMenuItem 
                              onSelect={() => {
                                setTimeout(() => {
                                  if (confirm("Are you sure you want to delete this project?")) {
                                    deleteProject({ id: project._id });
                                    if (isActive) router.push("/studio");
                                  }
                                }, 100);
                              }}
                              className="flex items-center gap-2 cursor-pointer focus:bg-white/5 text-red-500 hover:text-red-400"
                            >
                              <Trash2 className="size-4" />
                              <span className="text-xs">Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-white/5">
        {session && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton 
                    size="lg" 
                    className="hover:bg-white/5"
                    tooltip="Account"
                  >
                    <Avatar className="h-6 w-6 border border-white/10">
                      <AvatarImage src={session.user.image || undefined} alt={session.user.name} />
                      <AvatarFallback className="bg-neutral-900 text-[8px] uppercase">
                        {session.user.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-left ml-2">
                      <span className="text-xs font-medium truncate w-32">{session.user.name}</span>
                      <span className="text-[10px] text-neutral-500 truncate w-32">{session.user.email}</span>
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
                  <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/') } })}>
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
