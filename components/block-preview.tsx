import type { BlockDef } from "@/lib/types";

function shapeOf(block: BlockDef) {
  const name = block.layout;
  if (name === "hero" || name === "simplehero" || name === "heroslider") return "hero";
  if (name.includes("faq")) return "faq";
  if (name === "quote" || name === "case_quote" || block.slots.quote) return "quote";
  if (name.includes("gallery") || name === "image_cards" || name.includes("card") || name === "grid") return "cards";
  if (name === "logos" || name === "certificeringen") return "logos";
  if (name === "stappen" || name === "werkwijze" || name === "checklist") return "steps";
  if (name === "reviews") return "reviews";
  if (name.includes("form") || name === "newsletter") return "form";
  if (name.includes("map") || name === "location_finder") return "map";
  if (name.includes("slider") || name === "videos") return "slider";
  if (name.includes("loop") || name === "cases") return "list";
  if (name.includes("team")) return "team";
  if (name === "image_marquee") return "marquee";
  if (name === "image_text" || (block.slots.image && (block.slots.text || block.slots.heading))) return "split";
  if (block.slots.image && !block.slots.text) return "image";
  return "text";
}

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
  const shape = shapeOf(block);

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
        {shape === "hero" ? (
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
        {shape === "split" ? (
          <div className="grid h-32 grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#e4e4e4]" />
            <div>
              <p className="line-clamp-2 text-xs font-semibold text-[#061122]">{title}</p>
              <p className="mt-1 line-clamp-4 text-[11px] leading-4 text-[#585858]">{copy}</p>
            </div>
          </div>
        ) : null}
        {shape === "quote" ? (
          <div className="flex h-32 items-center rounded-xl bg-white px-3">
            <p className="line-clamp-4 text-sm text-[#f18500]">“{copy}”</p>
          </div>
        ) : null}
        {shape === "faq" ? (
          <div className="space-y-1.5">
            {["Vraag 1", "Vraag 2", "Vraag 3"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-[11px] text-[#061122]">
                <span>{item}</span>
                <span className="text-[#f18500]">+</span>
              </div>
            ))}
          </div>
        ) : null}
        {shape === "cards" ? (
          <div className="grid h-32 grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-[#e4e4e4]" />
            <div className="rounded-lg bg-[#e4e4e4]" />
            <div className="rounded-lg bg-[#e4e4e4]" />
          </div>
        ) : null}
        {shape === "logos" ? (
          <div className="flex h-32 items-center justify-between gap-2 px-1">
            {["A", "B", "C", "D"].map((item) => (
              <span key={item} className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs text-[#585858]">
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {shape === "steps" ? (
          <ol className="space-y-2">
            {["1", "2", "3"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-[11px] text-[#061122]">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f18500] text-[10px] text-white">{item}</span>
                <span className="h-2 flex-1 rounded bg-white" />
              </li>
            ))}
          </ol>
        ) : null}
        {shape === "reviews" ? (
          <div className="rounded-xl bg-white p-3">
            <p className="text-[11px] tracking-widest text-[#f18500]">★★★★★</p>
            <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-[#585858]">{copy}</p>
          </div>
        ) : null}
        {shape === "form" ? (
          <div className="space-y-1.5">
            <div className="h-6 rounded-md bg-white" />
            <div className="h-6 rounded-md bg-white" />
            <div className="h-6 w-16 rounded-full bg-[#f18500]" />
          </div>
        ) : null}
        {shape === "map" ? (
          <div className="relative h-32 rounded-xl bg-[#d9e4dc]">
            <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f18500]" />
          </div>
        ) : null}
        {shape === "slider" ? (
          <div className="flex h-32 flex-col justify-end rounded-xl bg-[#e4e4e4] p-2">
            <div className="flex justify-center gap-1">
              <span className="h-1.5 w-4 rounded-full bg-[#f18500]" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
          </div>
        ) : null}
        {shape === "list" ? (
          <div className="space-y-1.5">
            {["Item", "Item", "Item"].map((item, index) => (
              <div key={index} className="h-6 rounded-md bg-white" />
            ))}
          </div>
        ) : null}
        {shape === "team" ? (
          <div className="grid h-32 grid-cols-3 gap-2">
            {["1", "2", "3"].map((item) => (
              <div key={item} className="flex flex-col items-center gap-1">
                <span className="h-10 w-10 rounded-full bg-[#e4e4e4]" />
                <span className="h-1.5 w-8 rounded bg-white" />
              </div>
            ))}
          </div>
        ) : null}
        {shape === "marquee" ? (
          <div className="flex h-32 items-center gap-2 overflow-hidden">
            <div className="h-16 w-24 shrink-0 rounded-lg bg-[#e4e4e4]" />
            <div className="h-16 w-24 shrink-0 rounded-lg bg-[#d5d5d5]" />
            <div className="h-16 w-24 shrink-0 rounded-lg bg-[#e4e4e4]" />
          </div>
        ) : null}
        {shape === "image" ? <div className="h-32 rounded-xl bg-[#e4e4e4]" /> : null}
        {shape === "text" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#061122]">{title}</p>
            <p className="line-clamp-4 text-[11px] leading-4 text-[#585858]">{copy}</p>
            {block.slots.button ? (
              <span className="inline-block rounded-full bg-[#f18500] px-2 py-0.5 text-[10px] text-white">Knop</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
