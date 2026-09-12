"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";

export function MobileTabs({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span>{label.split(" ")[0]}</span>
            {href === "/review" && reviewCount > 0 && (
              <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
