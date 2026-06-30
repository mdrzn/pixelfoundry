"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { siteConfig, marketingNav } from "@/lib/site-config";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MenuIcon } from "lucide-react";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data } = useSession();

  const isAuthenticated = Boolean(data?.user);
  const credits = (data?.user as { credits?: number } | undefined)?.credits;
  const creditLabel =
    typeof credits === "number" ? `${credits} credits` : null;

  return (
    <header className="top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            PF
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-semibold">{siteConfig.name}</span>
            <span className="text-xs text-muted-foreground">
              Creative AI Control Hub
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavigationMenu>
            <NavigationMenuList>
              {marketingNav.map((item) => (
                <NavigationMenuItem key={item.name}>
                  <NavigationMenuLink
                    href={item.href}
                    className={cn(
                      "text-sm font-medium transition-colors hover:text-primary",
                      pathname === item.href
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.name}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              {creditLabel ? (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {creditLabel}
                </span>
              ) : null}
              <Button variant="outline" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                variant="ghost"
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/register">{siteConfig.cta.primaryLabel}</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <MenuIcon className="h-4 w-4" />
              <span className="sr-only">Toggle navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader className="pb-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-left"
                onClick={() => setOpen(false)}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  PF
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-semibold">
                    {siteConfig.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Creative AI Control Hub
                  </span>
                </div>
              </Link>
            </SheetHeader>
            <Separator className="mb-4" />
            <div className="flex flex-col gap-3">
              {marketingNav.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-muted-foreground transition hover:text-primary"
                >
                  <span className="flex items-center gap-2">
                    {item.name}
                    {item.badge ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </span>
                  {item.description ? (
                    <span className="block text-xs text-muted-foreground/70">
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col gap-3">
              {isAuthenticated ? (
                <>
                  {creditLabel ? (
                    <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                      {creditLabel}
                    </div>
                  ) : null}
                  <Button asChild>
                    <Link href="/dashboard" onClick={() => setOpen(false)}>
                      Dashboard
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/auth/login">Sign in</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/auth/register">
                      {siteConfig.cta.primaryLabel}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
