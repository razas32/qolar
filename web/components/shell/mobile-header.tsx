"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "./theme-toggle";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
      <Link href="/" className="text-lg font-semibold tracking-tight text-sidebar-foreground">
        Qolar
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
