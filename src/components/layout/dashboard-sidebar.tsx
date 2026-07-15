"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { UserRole } from "@prisma/client";
import {
  BadgeDollarSign,
  Brush,
  AudioLines,
  Boxes,
  Captions,
  ChevronRight,
  Clapperboard,
  Coins,
  FileImage,
  FilmIcon,
  ImageIcon,
  Languages,
  LayoutDashboardIcon,
  LibraryIcon,
  LifeBuoy,
  Podcast,
  Settings,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Video,
  Workflow,
} from "lucide-react";

import { dashboardNav, siteConfig, type NavItem } from "@/lib/site-config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type DashboardUser = {
  id: string;
  name?: string | null;
  email: string;
  credits: number;
  role: UserRole;
};

const iconMap: Record<string, ElementType> = {
  Overview: LayoutDashboardIcon,
  "Create Image": ImageIcon,
  "Edit Image": Brush,
  "Create Video": FilmIcon,
  "Multi-Shot": Clapperboard,
  "Voice-over": AudioLines,
  Shorts: Sparkles,
  "Scene Builder": Boxes,
  Podcast: Podcast,
  "Translate Text": Languages,
  Transcribe: Captions,
  "Translate Image": FileImage,
  Subtitles: Subtitles,
  Dubbing: Video,
  "My Library": LibraryIcon,
  Canvas: Workflow,
  "Billing & Credits": BadgeDollarSign,
  Settings,
  Support: LifeBuoy,
  "Admin Console": ShieldCheck,
};

function useActivePath() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
  return { pathname, isActive };
}

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = iconMap[item.name] ?? LayoutDashboardIcon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "relative gap-3 rounded-md transition-colors",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary"
        )}
      >
        <Link href={item.href} className="flex items-center gap-3">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? "text-sidebar-primary" : "text-muted-foreground"
            )}
          />
          <span className="truncate">{item.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavSection({
  label,
  items,
  open,
  onToggle,
  isActive,
}: {
  label: string;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <SidebarGroup className="py-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{label}</span>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                open && "rotate-90"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenu className="mt-1">
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

const OPEN_STORAGE_KEY = "pf-sidebar-open-groups";

export function DashboardSidebar({
  children,
  user,
}: {
  children: React.ReactNode;
  user: DashboardUser;
}) {
  const { pathname, isActive } = useActivePath();
  const groups = dashboardNav.groups;

  // All groups open by default; persist the user's collapse choices.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, true]))
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, boolean>;
        setOpenGroups((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const accountItems = dashboardNav.account.filter(
    (item) => !item.adminOnly || user.role === UserRole.ADMIN
  );

  const initials =
    user.name
      ?.split(" ")
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || user.email.slice(0, 2).toUpperCase();

  // Human label for the current route, shown in the top bar.
  const currentPageName = useMemo(() => {
    if (isActive(dashboardNav.overview.href) && pathname === "/dashboard") {
      return dashboardNav.overview.name;
    }
    const all: NavItem[] = [
      dashboardNav.overview,
      ...groups.flatMap((g) => g.items),
      ...dashboardNav.account,
    ];
    const match = all
      .filter((i) => i.href !== "/dashboard")
      .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    return match?.name ?? dashboardNav.overview.name;
  }, [pathname, groups, isActive]);

  const isCanvas = pathname.startsWith("/dashboard/canvas");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="border-b px-4 py-3.5">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-sm font-bold text-white shadow-sm">
                PF
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{siteConfig.name}</span>
                <span className="text-xs text-muted-foreground">AI Studio</span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2 py-3">
            <SidebarMenu>
              <NavLink
                item={dashboardNav.overview}
                active={isActive(dashboardNav.overview.href)}
              />
            </SidebarMenu>

            <SidebarSeparator className="my-2" />

            {groups.map((group) => (
              <NavSection
                key={group.label}
                label={group.label}
                items={group.items}
                open={openGroups[group.label] ?? true}
                onToggle={() => toggleGroup(group.label)}
                isActive={isActive}
              />
            ))}

            <SidebarSeparator className="my-2" />

            <SidebarGroup className="py-1">
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarMenu>
                {accountItems.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t px-3 py-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-brand/80 to-brand-2/80 text-xs text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col text-xs">
                <span className="truncate font-medium text-foreground">
                  {user.name ?? user.email}
                </span>
                <span className="text-muted-foreground">{user.credits} credits</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="md:hidden" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Studio</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="font-medium text-foreground">{currentPageName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                <Coins className="h-3.5 w-3.5" />
                {user.credits} credits
              </span>
              <ThemeToggle />
            </div>
          </header>
          <div
            className={
              isCanvas
                ? "flex-1 overflow-hidden"
                : "flex-1 overflow-y-auto px-6 py-6"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export function DashboardPageContainer({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
