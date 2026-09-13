export function MerchantAvatar({ name, color }: { name: string; color: string }) {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean);
  // Two or more words: first letter of each of the first two. One word: its first two letters.
  const initials =
    words.length >= 2
      ? words
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join("")
      : (words[0] ?? "").slice(0, 2).toUpperCase();
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
      style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
    >
      {initials || "?"}
    </span>
  );
}
