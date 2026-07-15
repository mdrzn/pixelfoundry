export type NavItem = {
  name: string;
  href: string;
  description?: string;
  badge?: string;
  adminOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const marketingNav: NavItem[] = [
  { name: "Product", href: "/#product" },
  { name: "Pricing", href: "/#pricing" },
  { name: "Models", href: "/#models" },
  { name: "Resources", href: "/#resources" },
];

export const dashboardNav = {
  // Standalone home link, rendered above the grouped sections.
  overview: { name: "Overview", href: "/dashboard" } as NavItem,
  // Tools clustered by intent so the list reads at a glance.
  groups: [
    {
      label: "Create",
      items: [
        { name: "Create Image", href: "/dashboard/create-image" },
        { name: "Edit Image", href: "/dashboard/edit-image" },
        { name: "Create Video", href: "/dashboard/create-video" },
        { name: "Multi-Shot", href: "/dashboard/multi-shot" },
        { name: "Scene Builder", href: "/dashboard/scene-builder" },
      ],
    },
    {
      label: "Audio & Voice",
      items: [
        { name: "Voice-over", href: "/dashboard/voiceover" },
        { name: "Podcast", href: "/dashboard/podcast" },
        { name: "Shorts", href: "/dashboard/shorts" },
      ],
    },
    {
      label: "Translate & Text",
      items: [
        { name: "Translate Text", href: "/dashboard/translate-text" },
        { name: "Transcribe", href: "/dashboard/transcribe" },
        { name: "Translate Image", href: "/dashboard/translate-image" },
        { name: "Subtitles", href: "/dashboard/subtitles" },
        { name: "Dubbing", href: "/dashboard/dubbing" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { name: "Canvas", href: "/dashboard/canvas" },
        { name: "My Library", href: "/dashboard/library" },
      ],
    },
  ] as NavGroup[],
  // Account + support, pinned to the lower section.
  account: [
    { name: "Billing & Credits", href: "/dashboard/billing" },
    { name: "Admin Console", href: "/dashboard/admin", adminOnly: true },
    { name: "Settings", href: "/dashboard/settings" },
    { name: "Support", href: "/dashboard/support" },
  ] as NavItem[],
};

export const siteConfig = {
  name: "PixelFoundry",
  description:
    "A focused creative AI dashboard that makes it easy to generate, edit, and orchestrate visual storytelling through curated models.",
  cta: {
    primaryLabel: "Launch Studio",
    secondaryLabel: "View Docs",
  },
  social: {
    twitter: "https://x.com",
    github: "https://github.com",
  },
};
