export type Role = "admin" | "marketeer" | "klant";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ClientPublic = {
  id: string;
  name: string;
  siteUrl: string;
};

export type PostKind = "pages" | "cases" | "posts";

export type ContentItem = {
  id: number;
  title: string;
  slug: string;
  status: string;
  link: string;
};

export type BlockSlots = {
  heading: boolean;
  text: boolean;
  image: boolean;
  button: boolean;
  quote: boolean;
  stats: boolean;
};

export type BlockDef = {
  layout: string;
  label: string;
  headingKey: string | null;
  textKey: string | null;
  slots: BlockSlots;
};

export type PageBlock = {
  index: number;
  layout: string;
  label: string;
  heading: string;
  text: string;
  def: BlockDef | null;
};

export type HeadingHit = {
  level: number;
  text: string;
  where: string;
};

export type SeoReport = {
  h1: HeadingHit[];
  h2: HeadingHit[];
  h1Status: "missing" | "ok" | "multiple";
  h1Message: string;
  keyword: string;
  checks: { label: string; ok: boolean; detail: string }[];
};
