"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { UserRole } from "@prisma/client";
import {
  BadgeDollarSign,
  Brush,
  FilmIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { dashboardNav, siteConfig } from "@/lib/site-config";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

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
  "My Library": LibraryIcon,
  Canvas: Workflow,
  "Billing & Credits": BadgeDollarSign,
  Settings,
  Support: LifeBuoy,
  "Admin Console": ShieldCheck,
};

export function DashboardSidebar({
  children,
  user,
}: {
  children: React.ReactNode;
  user: DashboardUser;
}) {
  const pathname = usePathname();
  const initials =
    user.name
      ?.split(" ")
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") ||
    user.email.slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                PF
              </div>
              <div className="flex flex-col text-sm">
                <span className="font-semibold">{siteConfig.name}</span>
                <span className="text-xs text-muted-foreground">AI Studio</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="flex flex-1 flex-col justify-between">
            <nav className="px-2 py-4 text-sm">
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarMenu>
                  {dashboardNav.primary
                    .filter((item) => !item.adminOnly || user.role === UserRole.ADMIN)
                    .map((item) => {
                    const Icon = iconMap[item.name] ?? LayoutDashboardIcon;
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link
                            href={item.href}
                            className="flex items-center gap-3"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>

              <SidebarSeparator className="my-4" />

              <SidebarGroup>
                <SidebarGroupLabel>Support</SidebarGroupLabel>
                <SidebarMenu>
                  {dashboardNav.secondary.map((item) => {
                    const Icon = iconMap[item.name] ?? LifeBuoy;
                    const isActive = pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link
                            href={item.href}
                            className="flex items-center gap-3"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            </nav>
          </SidebarContent>
          <SidebarFooter className="border-t px-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col text-xs">
                <span className="font-medium text-foreground">
                  {user.name ?? user.email}
                </span>
                <span className="text-muted-foreground">
                  {user.credits} credits
                </span>
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
          <header className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {siteConfig.name} Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage credits, generate assets, and track runs in one place.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {user.credits} credits
              </span>
              <ThemeToggle />
              <SidebarTrigger className="md:hidden" />
            </div>
          </header>
          <div className={pathname.startsWith("/dashboard/canvas") ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto px-6 py-6"}>{children}</div>
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
