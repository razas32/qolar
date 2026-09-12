import { Inbox, Landmark, LayoutDashboard, List, Tags, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/review", label: "Review", icon: Inbox },
  { href: "/settings", label: "Categories & rules", icon: Tags },
  { href: "/connect", label: "Accounts", icon: Landmark },
];

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
