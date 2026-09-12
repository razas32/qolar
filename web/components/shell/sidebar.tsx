"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

export function Sidebar({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="mb-6 px-3 text-xl font-semibold tracking-tight text-sidebar-foreground">
        Qolar
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {href === "/review" && reviewCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between px-2 pt-4">
        <UserButton />
        <ThemeToggle />
      </div>
    </aside>
  );
}
