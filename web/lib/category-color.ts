/** 12 hues tuned to read on both the dark canvas and the light one.
 *  Index comes from the API's `color_index` so every surface agrees. */
export const CATEGORY_PALETTE = [
  "oklch(0.72 0.15 275)", // violet
  "oklch(0.75 0.15 200)", // cyan
  "oklch(0.75 0.17 160)", // green
  "oklch(0.80 0.16 85)",  // amber
  "oklch(0.70 0.19 25)",  // coral
  "oklch(0.72 0.17 340)", // pink
  "oklch(0.70 0.13 240)", // blue
  "oklch(0.78 0.14 120)", // lime
  "oklch(0.72 0.12 50)",  // rust
  "oklch(0.70 0.14 300)", // purple
  "oklch(0.75 0.10 180)", // teal
  "oklch(0.75 0.12 60)",  // gold
] as const;

export const TRANSFERS_COLOR = "oklch(0.62 0.02 260)";
export const UNCATEGORIZED_COLOR = "var(--muted-foreground)";

type Cat = { name: string; color_index: number };

function hashIndex(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CATEGORY_PALETTE.length;
}

export function colorFor(name: string | null, categories: Cat[]): string {
  if (!name || name === "Uncategorized") return UNCATEGORIZED_COLOR;
  if (name === "Transfers") return TRANSFERS_COLOR;
  const hit = categories.find((c) => c.name === name);
  return CATEGORY_PALETTE[(hit ? hit.color_index : hashIndex(name)) % CATEGORY_PALETTE.length];
}
