export function MerchantAvatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
      style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
    >
      {initials}
    </span>
  );
}
