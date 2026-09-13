import type { ComponentPropsWithRef } from "react";
import { colorFor } from "@/lib/category-color";
import { cn } from "@/lib/utils";

type Cat = { name: string; color_index: number };
type Props = {
  name: string | null;
  categories: Cat[];
  size?: "sm" | "md";
  active?: boolean;
} & Omit<ComponentPropsWithRef<"button">, "name">;

/**
 * When used as a Base UI `MenuTrigger`'s `render` element, the trigger clones this
 * element with extra props (ref for anchor registration, aria-haspopup/aria-controls/id,
 * onMouseDown/onKeyDown, type, disabled) — those all arrive as `...rest`/`ref` here and
 * must reach the actual DOM node, or the menu loses its anchor and keyboard/ARIA wiring.
 */
export function CategoryChip({ name, categories, size = "sm", className, active, onClick, ref, ...rest }: Props) {
  const color = colorFor(name, categories);
  const label = name ?? "Uncategorized";
  const classes = cn(
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-card font-medium whitespace-nowrap",
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    onClick && "transition-colors hover:bg-accent disabled:opacity-50 disabled:pointer-events-none",
    active && "ring-2 ring-ring",
    !name && "text-muted-foreground",
    className,
  );
  const dot = <span className="size-2 rounded-full" style={{ background: color }} />;

  if (!onClick) {
    return (
      <span className={classes}>
        {dot}
        {label}
      </span>
    );
  }

  return (
    <button type="button" {...rest} ref={ref} onClick={onClick} className={classes}>
      {dot}
      {label}
    </button>
  );
}
