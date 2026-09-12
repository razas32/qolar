import { colorFor } from "@/lib/category-color";
import { cn } from "@/lib/utils";

type Cat = { name: string; color_index: number };
type Props = { name: string | null; categories: Cat[]; size?: "sm" | "md"; className?: string; onClick?: () => void; active?: boolean };

export function CategoryChip({ name, categories, size = "sm", className, onClick, active }: Props) {
  const color = colorFor(name, categories);
  const label = name ?? "Uncategorized";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card font-medium whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        onClick && "transition-colors hover:bg-accent",
        active && "ring-2 ring-ring",
        !name && "text-muted-foreground",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </Tag>
  );
}
