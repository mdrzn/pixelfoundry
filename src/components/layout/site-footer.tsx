import Link from "next/link";

import { siteConfig } from "@/lib/site-config";

const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Overview", href: "/#product" },
      { label: "Workflow", href: "/#workflow" },
      { label: "Changelog", href: "/#resources" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/#resources" },
      { label: "Contact", href: "/#contact" },
      { label: "Partners", href: "/#models" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Security", href: "/#security" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="flex flex-col gap-3">
          <span className="text-lg font-semibold">{siteConfig.name}</span>
          <p className="text-sm text-muted-foreground">
            {siteConfig.description}
          </p>
          <div className="flex items-center gap-4 pt-2 text-sm">
            <Link
              href={siteConfig.social.twitter}
              className="text-muted-foreground transition hover:text-primary"
            >
              Twitter
            </Link>
            <Link
              href={siteConfig.social.github}
              className="text-muted-foreground transition hover:text-primary"
            >
              GitHub
            </Link>
          </div>
        </div>
        {footerLinks.map((section) => (
          <div key={section.heading}>
            <p className="text-sm font-semibold text-muted-foreground">
              {section.heading}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
      </div>
    </footer>
  );
}

