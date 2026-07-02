export type NavItem = {
  name: string;
  href: string;
  description?: string;
  badge?: string;
  adminOnly?: boolean;
};

export const marketingNav: NavItem[] = [
  { name: "Product", href: "/#product" },
  { name: "Pricing", href: "/#pricing" },
  { name: "Models", href: "/#models" },
  { name: "Resources", href: "/#resources" },
];

export const dashboardNav = {
  primary: [
    { name: "Overview", href: "/dashboard" },
    { name: "Create Image", href: "/dashboard/create-image" },
    { name: "Edit Image", href: "/dashboard/edit-image" },
    { name: "Create Video", href: "/dashboard/create-video" },
    { name: "Multi-Shot", href: "/dashboard/multi-shot" },
    { name: "Voice-over", href: "/dashboard/voiceover" },
    { name: "Shorts", href: "/dashboard/shorts" },
    { name: "Scene Builder", href: "/dashboard/scene-builder" },
    { name: "Podcast", href: "/dashboard/podcast" },
    { name: "Translate Text", href: "/dashboard/translate-text" },
    { name: "Transcribe", href: "/dashboard/transcribe" },
    { name: "Canvas", href: "/dashboard/canvas" },
    { name: "My Library", href: "/dashboard/library" },
    { name: "Billing & Credits", href: "/dashboard/billing" },
    { name: "Admin Console", href: "/dashboard/admin", adminOnly: true },
  ],
  secondary: [
    { name: "Settings", href: "/dashboard/settings" },
    { name: "Support", href: "/dashboard/support" },
  ],
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
