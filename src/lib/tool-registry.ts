import type { ElementType } from "react";
import {
  AudioLines,
  BadgeDollarSign,
  Boxes,
  Brush,
  Captions,
  Clapperboard,
  FileImage,
  FilmIcon,
  ImageIcon,
  Languages,
  LayoutDashboardIcon,
  LibraryIcon,
  LifeBuoy,
  Podcast,
  Settings,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Video,
  Workflow,
} from "lucide-react";

/**
 * Single source of truth for each studio tool's identity — icon + accent color
 * + one-line description. The sidebar, the Overview launcher, and studio page
 * headers all read from here so a tool looks the same everywhere.
 *
 * Class strings are written in full (never interpolated) so Tailwind emits them.
 */
export type ToolColor =
  | "violet"
  | "indigo"
  | "blue"
  | "sky"
  | "cyan"
  | "fuchsia"
  | "pink"
  | "rose"
  | "teal"
  | "emerald"
  | "green"
  | "amber"
  | "orange"
  | "slate";

const COLORS: Record<ToolColor, { tile: string; icon: string }> = {
  violet: { tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", icon: "text-violet-600 dark:text-violet-400" },
  indigo: { tile: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300", icon: "text-indigo-600 dark:text-indigo-400" },
  blue: { tile: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300", icon: "text-blue-600 dark:text-blue-400" },
  sky: { tile: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300", icon: "text-sky-600 dark:text-sky-400" },
  cyan: { tile: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300", icon: "text-cyan-600 dark:text-cyan-400" },
  fuchsia: { tile: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", icon: "text-fuchsia-600 dark:text-fuchsia-400" },
  pink: { tile: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300", icon: "text-pink-600 dark:text-pink-400" },
  rose: { tile: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300", icon: "text-rose-600 dark:text-rose-400" },
  teal: { tile: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300", icon: "text-teal-600 dark:text-teal-400" },
  emerald: { tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", icon: "text-emerald-600 dark:text-emerald-400" },
  green: { tile: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300", icon: "text-green-600 dark:text-green-400" },
  amber: { tile: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", icon: "text-amber-600 dark:text-amber-400" },
  orange: { tile: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300", icon: "text-orange-600 dark:text-orange-400" },
  slate: { tile: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300", icon: "text-slate-500 dark:text-slate-400" },
};

export function tileClass(color: ToolColor): string {
  return COLORS[color].tile;
}

export function iconClass(color: ToolColor): string {
  return COLORS[color].icon;
}

export type NavMeta = {
  name: string;
  href: string;
  icon: ElementType;
  color: ToolColor;
  description: string;
};

// The 15 creative tools shown in the Overview launcher (sidebar order).
export const TOOLS: NavMeta[] = [
  { name: "Create Image", href: "/dashboard/create-image", icon: ImageIcon, color: "violet", description: "Generate images from a text prompt." },
  { name: "Edit Image", href: "/dashboard/edit-image", icon: Brush, color: "indigo", description: "Transform or extend an existing image." },
  { name: "Create Video", href: "/dashboard/create-video", icon: FilmIcon, color: "blue", description: "Synthesize motion from text or images." },
  { name: "Multi-Shot", href: "/dashboard/multi-shot", icon: Clapperboard, color: "sky", description: "Turn a story into a sequence of shots." },
  { name: "Scene Builder", href: "/dashboard/scene-builder", icon: Boxes, color: "cyan", description: "Compose keyframed scenes into one film." },
  { name: "Voice-over", href: "/dashboard/voiceover", icon: AudioLines, color: "fuchsia", description: "Narrate a script with AI voices." },
  { name: "Podcast", href: "/dashboard/podcast", icon: Podcast, color: "pink", description: "Produce a multi-speaker episode." },
  { name: "Shorts", href: "/dashboard/shorts", icon: Sparkles, color: "rose", description: "Auto-generate captioned shorts." },
  { name: "Translate Text", href: "/dashboard/translate-text", icon: Languages, color: "teal", description: "Translate text into any language." },
  { name: "Transcribe", href: "/dashboard/transcribe", icon: Captions, color: "emerald", description: "Convert audio into accurate text." },
  { name: "Translate Image", href: "/dashboard/translate-image", icon: FileImage, color: "green", description: "Translate text inside an image." },
  { name: "Subtitles", href: "/dashboard/subtitles", icon: Subtitles, color: "amber", description: "Generate subtitles for a video." },
  { name: "Dubbing", href: "/dashboard/dubbing", icon: Video, color: "orange", description: "Dub a video into another language." },
  { name: "Canvas", href: "/dashboard/canvas", icon: Workflow, color: "violet", description: "Compose workflows on an infinite canvas." },
  { name: "My Library", href: "/dashboard/library", icon: LibraryIcon, color: "slate", description: "Browse, tag, and manage your assets." },
];

// Non-tool destinations (Overview + account), so the sidebar can color every row.
export const NAV_EXTRAS: NavMeta[] = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboardIcon, color: "indigo", description: "Your studio at a glance." },
  { name: "Billing & Credits", href: "/dashboard/billing", icon: BadgeDollarSign, color: "emerald", description: "Manage credits and billing." },
  { name: "Admin Console", href: "/dashboard/admin", icon: ShieldCheck, color: "slate", description: "Administer the workspace." },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, color: "slate", description: "Account and app settings." },
  { name: "Support", href: "/dashboard/support", icon: LifeBuoy, color: "slate", description: "Get help and docs." },
];

const byHref = new Map<string, NavMeta>(
  [...TOOLS, ...NAV_EXTRAS].map((t) => [t.href, t])
);

export function navMetaFor(href: string): NavMeta | undefined {
  return byHref.get(href);
}
