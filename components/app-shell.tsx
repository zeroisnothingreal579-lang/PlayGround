"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Blocks,
  ChevronLeft,
  ChevronRight,
  Command,
  FolderKanban,
  LayoutDashboard,
  Menu,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/skills", label: "Skills Library", icon: Blocks },
  { href: "/pipeline", label: "Full Pipeline", icon: Workflow },
  { href: "/runs", label: "Workflow Runs", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  collapsed,
  recentProjects,
  onNavigate,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  recentProjects: { id: string; name: string }[];
  onNavigate?: () => void;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 overflow-hidden">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_-8px_hsl(var(--primary))]">
            <Blocks className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-tight">
                Replica Studio
              </span>
              <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                AI app workspace
              </span>
            </span>
          ) : null}
        </Link>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close navigation">
            <X />
          </Button>
        ) : null}
      </div>

      <div className={cn("p-3", collapsed && "px-2")}>
        <Button
          asChild
          className={cn("w-full", collapsed && "px-0")}
          size={collapsed ? "icon" : "default"}
          onClick={onNavigate}
        >
          <Link href="/projects/new" aria-label="New Project">
            <Plus />
            {!collapsed ? "New Project" : null}
          </Link>
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="space-y-1 px-3 pb-4" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const content = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {!collapsed && active ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href} delayDuration={100}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              content
            );
          })}
        </nav>

        {!collapsed && recentProjects.length > 0 ? (
          <div className="px-3 pb-4">
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Recent projects
              </p>
              <Link
                href="/projects"
                onClick={onNavigate}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                All
              </Link>
            </div>
            <div className="space-y-0.5">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    pathname === `/projects/${project.id}` && "bg-secondary text-foreground",
                  )}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border bg-background text-[9px] font-semibold uppercase text-muted-foreground">
                    {project.name.slice(0, 1)}
                  </span>
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </ScrollArea>

      <div className={cn("border-t border-border p-3", collapsed && "px-2")}>
        {onToggle ? (
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn("w-full text-muted-foreground", !collapsed && "justify-start")}
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
            {!collapsed ? "Collapse sidebar" : null}
          </Button>
        ) : null}
        {!collapsed ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
            <Command className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              Replica pack · 11 skills
            </span>
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  recentProjects,
  providerLabel,
}: {
  children: React.ReactNode;
  recentProjects: { id: string; name: string }[];
  providerLabel: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const stored = window.localStorage.getItem("replica-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("replica-sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card/60 transition-[width] duration-200 lg:block",
            collapsed ? "w-[76px]" : "w-[260px]",
          )}
        >
          <SidebarContent
            collapsed={collapsed}
            recentProjects={recentProjects}
            onToggle={toggle}
          />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              className="absolute inset-0 bg-black/70"
              aria-label="Close navigation overlay"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-border bg-card shadow-2xl">
              <SidebarContent
                collapsed={false}
                recentProjects={recentProjects}
                onNavigate={() => setMobileOpen(false)}
                onClose={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <PanelLeft className="h-3.5 w-3.5" />
              <span>Workspace</span>
              <span className="text-border">/</span>
              <span className="text-foreground/80">
                {navigation.find((item) => isActive(pathname, item.href))?.label || "Project"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    providerLabel === "Not configured" || providerLabel === "Storage error"
                      ? "bg-warning"
                      : providerLabel === "Demo mode"
                        ? "bg-muted-foreground"
                        : "bg-success",
                  )}
                />
                AI: {providerLabel}
              </span>
              <Link
                href="/settings"
                className="focus-ring rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Open settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </header>
          <main className="min-h-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
