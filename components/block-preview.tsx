import type { BlockDef } from "@/lib/types";

export function BlockPreview({
  block,
  heading,
  text,
  active,
}: {
  block: BlockDef;
  heading?: string;
  text?: string;
  active?: boolean;
}) {
  const title = heading || block.label;
  const copy = text || "Tekst uit het themaveld";
  const hero = block.layout === "hero" || block.layout === "simplehero" || block.layout === "heroslider";
  const split = block.layout === "image_text" || (block.slots.image && block.slots.text && !hero);
  const quote = block.slots.quote && !block.slots.image;

  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 ${active ? "ring-[#f18500]" : "ring-[#e4e4e4]"}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="font-heading text-sm text-[#061122]">{block.label}</p>
        <span className="rounded-full bg-[#fff4e6] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#633100]">
          {block.layout}
        </span>
      </div>
      <div className="min-h-36 flex-1 bg-[#f8f7f6] p-3">
        {hero ? (
          <div className="flex h-32 flex-col justify-end rounded-xl bg-gradient-to-br from-[#061122] to-[#f18500] p-3 text-white">
            <p className="line-clamp-2 text-sm font-semibold">{title}</p>
            {block.slots.stats ? (
              <div className="mt-2 flex gap-1">
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">120%</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">€12</span>
              </div>
            ) : null}
            {block.slots.button ? (
              <span className="mt-2 w-fit rounded-full bg-white px-2 py-0.5 text-[10px] text-[#f18500]">Knop</span>
            ) : null}
          </div>
        ) : null}
        {split && !hero ? (
          <div className="grid h-32 grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#e4e4e4]" />
            <div>
              <p className="line-clamp-2 text-xs font-semibold text-[#061122]">{title}</p>
              <p className="mt-1 line-clamp-4 text-[11px] leading-4 text-[#585858]">{copy}</p>
            </div>
          </div>
        ) : null}
        {quote ? (
          <div className="flex h-32 items-center rounded-xl bg-white px-3">
            <p className="line-clamp-4 text-sm text-[#f18500]">“{copy}”</p>
          </div>
        ) : null}
        {!hero && !split && !quote ? (
          <div className="space-y-2">
            {block.slots.heading ? <p className="text-xs font-semibold text-[#061122]">{title}</p> : null}
            {block.slots.image ? <div className="h-10 rounded-lg bg-[#e4e4e4]" /> : null}
            {block.slots.text ? <p className="line-clamp-3 text-[11px] leading-4 text-[#585858]">{copy}</p> : null}
            {block.slots.button ? (
              <span className="inline-block rounded-full bg-[#f18500] px-2 py-0.5 text-[10px] text-white">Knop</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
