"use client";

import { useMemo, useEffect } from "react";
import {
  Search,
  LogOut,
  Moon,
  Sun,
  Plus,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
  FolderPlus,
  Folder,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "next-themes";
import { WorkshopSwitcher } from "@/components/workshop-switcher";
import { useWorkshop } from "@/hooks/use-workshop";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { activeWorkshopId, activeWorkshopSlug } = useWorkshop();
  const { setTheme, theme } = useTheme();

  const createProject = useMutation(api.projects.createProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const togglePinProject = useMutation(api.projects.togglePinProject);
  const updateClassification = useMutation(api.projects.updateProjectClassification);
  const createClassification = useMutation(api.projects.createClassification);

  const projects = useQuery(
    api.projects.getProjects,
    activeWorkshopId ? { workshopId: activeWorkshopId } : "skip",
  );
  const classifications = useQuery(
    api.projects.getClassifications,
    activeWorkshopId ? { workshopId: activeWorkshopId } : "skip",
  );

  const chats = useMemo(() => projects ?? [], [projects]);
  
  // Debug logging
  useEffect(() => {
    console.log('[AppSidebar] Projects state:', {
      activeWorkshopId,
      activeWorkshopSlug,
      projects,
      projectsLength: projects?.length ?? 0,
      chatsLength: chats.length,
    });
  }, [activeWorkshopId, activeWorkshopSlug, projects, chats.length]);

  const handleCreateChat = async () => {
    if (!activeWorkshopId || !activeWorkshopSlug) return;
    const result = await createProject({
      name: "New Chat",
      workshopId: activeWorkshopId,
    });
    const slug = typeof result === "string" ? result : result.slug;
    router.push(`/${activeWorkshopSlug}/threads/${slug}`);
  };

  const handleCreateFolder = async () => {
    if (!activeWorkshopId) return;
    const name = prompt("Folder name:");
    if (!name?.trim()) return;
    const colors = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc"];
    await createClassification({
      workshopId: activeWorkshopId,
      name: name.trim(),
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  };

  const chatHref = activeWorkshopSlug ? `/${activeWorkshopSlug}/research` : "#";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="h-14 flex items-center px-4 border-b border-border">
        <div className="w-full group-data-[collapsible=icon]:hidden">
          <WorkshopSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4" data-lenis-prevent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleCreateChat}
                  tooltip="New Chat"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="size-4" />
                  <span className="text-xs font-semibold">New Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => activeWorkshopSlug && router.push(chatHref)}
                  isActive={pathname === chatHref}
                  tooltip="Chat"
                  className={cn(
                    "hover:bg-accent transition-all",
                    pathname === chatHref ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground",
                  )}
                >
                  <Search className="size-4" />
                  <span className="text-xs font-medium">Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            Chats
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects === undefined ? (
                <SidebarMenuItem>
                  <div className="px-4 py-2 text-xs text-muted-foreground">Loading...</div>
                </SidebarMenuItem>
              ) : chats.length === 0 ? (
                <SidebarMenuItem>
                  <div className="px-4 py-2 text-xs text-muted-foreground">No projects yet</div>
                </SidebarMenuItem>
              ) : (
                chats.map((chat) => {
                const href = activeWorkshopSlug ? `/${activeWorkshopSlug}/threads/${chat.slug}` : "#";
                const isActive = pathname === href;
                return (
                  <SidebarMenuItem key={chat._id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => activeWorkshopSlug && router.push(href)}
                      tooltip={chat.name}
                      className={cn(
                        "hover:bg-accent transition-all",
                        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      {chat.isPinned ? <Pin className="size-3.5 text-orange-500" /> : <Search className="size-3.5" />}
                      <span className="text-xs truncate">{chat.name}</span>
                      {chat.classificationId && <Folder className="ml-auto size-3 text-muted-foreground" />}
                    </SidebarMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Chat actions</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="w-52">
                        <DropdownMenuItem onSelect={() => togglePinProject({ id: chat._id })}>
                          {chat.isPinned ? <PinOff className="mr-2 size-4" /> : <Pin className="mr-2 size-4" />}
                          <span>{chat.isPinned ? "Unpin chat" : "Pin chat"}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          Add to Folder
                        </DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => updateClassification({ id: chat._id, classificationId: undefined })}>
                          No Folder
                        </DropdownMenuItem>
                        {(classifications ?? []).map((folder) => (
                          <DropdownMenuItem
                            key={folder._id}
                            onSelect={() => updateClassification({ id: chat._id, classificationId: folder._id })}
                          >
                            <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: folder.color || "#999" }} />
                            <span>{folder.name}</span>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onSelect={handleCreateFolder}>
                          <FolderPlus className="mr-2 size-4" />
                          <span>New Folder</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            if (confirm("Delete this chat?")) {
                              void deleteProject({ id: chat._id as Id<"projects"> });
                              if (isActive && activeWorkshopSlug) {
                                router.push(`/${activeWorkshopSlug}/research`);
                              }
                            }
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          <span>Delete chat</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        {session && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="hover:bg-accent" tooltip="Account">
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
                <DropdownMenuContent side="right" align="end" className="w-52" sideOffset={10}>
                  <DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
                    {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
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
