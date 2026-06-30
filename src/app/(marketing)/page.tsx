import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowUpRight,
  Check,
  Gauge,
  Layers3,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const featureHighlights = [
  {
    icon: Sparkles,
    title: "Curated model roster",
    description:
      "Skip the YAML spelunking. PixelFoundry surfaces best-in-class text-to-image, editing, and video models with sensible defaults.",
  },
  {
    icon: Gauge,
    title: "Predictable consumption",
    description:
      "Every job is priced in credits. Monitor balance live with guardrails that prevent overruns and surprise invoices.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-ready from day one",
    description:
      "SOC2 roadmap, regional data residency, and clean audit trails ensure compliance for regulated industries.",
  },
];

const workflowSteps = [
  {
    title: "Compose",
    description:
      "Describe the scene, upload references, or pick from presets tailored to your brand guidelines.",
  },
  {
    title: "Distribute",
    description:
      "PixelFoundry routes the job to the optimal vendor, monitors status, and retries automatically if needed.",
  },
  {
    title: "Deliver",
    description:
      "Receive production-ready assets with metadata, audit history, and optional webhook callbacks.",
  },
];

const modelShowcase = [
  {
    name: "Flux.1 Pro",
    type: "Concept illustration",
    blurb: "Rich art-direction and stylized branding with color harmony.",
  },
  {
    name: "Stable Diffusion XL Turbo",
    type: "Photo realism",
    blurb: "Sharp portraiture, product renders, and lifestyle scenes at speed.",
  },
  {
    name: "AnimateDiff Turbo",
    type: "Text-to-video",
    blurb: "Generate 6–12 second clips with coherent motion and cinematic pacing.",
  },
  {
    name: "Reimagine++",
    type: "Image editing",
    blurb: "Inpaint, outpaint, and restyle brand assets in minutes.",
  },
];

const planTiers = [
  {
    name: "Free",
    price: "$0",
    period: "Forever",
    bullet: [
      "100 starter credits",
      "Image + edit models",
      "Watermarked outputs",
    ],
    cta: "Start for free",
    accent: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    bullet: [
      "800 credits included",
      "Video generation access",
      "Priority job queue",
      "Webhook callbacks",
    ],
    cta: "Upgrade to Pro",
    accent: true,
  },
  {
    name: "Studio",
    price: "$79",
    period: "per month",
    bullet: [
      "2,500 credits",
      "Brand style libraries",
      "Collaborator seats",
      "Email & Slack support",
    ],
    cta: "Talk to sales",
    accent: false,
  },
];

const faqs = [
  {
    question: "Which external APIs does PixelFoundry support?",
    answer:
      "We integrate with Replicate, Stability AI, Luma, and other vendors via a broker layer. We’ll help you connect your keys or provision managed billing.",
  },
  {
    question: "Can I bring my own models?",
    answer:
      "Yes—define model endpoints with expected inputs and PixelFoundry will surface them as custom generators, complete with credit policies.",
  },
  {
    question: "How do credits work?",
    answer:
      "Each job deducts credits based on model cost and output complexity. Credits refresh monthly and additional packs roll over for 90 days.",
  },
];

export default function MarketingHome() {
  return (
    <div className="relative overflow-hidden bg-background text-foreground">
      <div className="absolute inset-x-0 -top-40 h-80 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 pb-24 pt-24">
        <section className="flex flex-col gap-10 text-center" id="hero">
          <Badge className="mx-auto w-fit rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-xs font-medium text-primary">
            Launching private beta • Invite only
          </Badge>
          <div className="mx-auto max-w-4xl space-y-6">
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              The creative operations dashboard for serious AI production.
            </h1>
            <p className="text-base text-muted-foreground md:text-lg">
              PixelFoundry streamlines how teams ideate, generate, and approve
              visual assets. Give your creatives curated models, centralize
              billing, and stay in control of quality.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 md:flex-row">
            <Button size="lg" asChild>
              <Link href="/dashboard">Launch Studio</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/#pricing">Compare Plans</Link>
            </Button>
          </div>
          <div className="grid gap-6 rounded-3xl border bg-card/60 p-6 shadow-lg backdrop-blur md:grid-cols-3">
            {featureHighlights.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="product"
          className="grid gap-12 rounded-3xl border bg-muted/30 p-10 md:grid-cols-[1.1fr_1fr]"
        >
          <div className="space-y-4">
            <Badge variant="secondary" className="text-xs uppercase tracking-wider">
              Workflow
            </Badge>
            <h2 className="text-3xl font-semibold md:text-4xl">
              Production-ready in three steps.
            </h2>
            <p className="text-base text-muted-foreground">
              PixelFoundry abstracts the messy orchestration layer. Creative
              directors craft prompts, producers schedule jobs, and the platform
              manages the rest.
            </p>
            <div className="space-y-8">
              {workflowSteps.map((step, index) => (
                <div key={step.title} className="relative pl-10">
                  <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border bg-background font-semibold">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-medium">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <Card className="border-primary/20 bg-background/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-primary" />
                Unified job console
              </CardTitle>
              <CardDescription>
                Monitor queue health, retry failures, and surface audit history
                for every generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                The console shows all jobs across vendors with per-model cost,
                duration, and output previews. Command palette shortcuts make it
                easy to trigger rerolls or variations.
              </p>
              <Button variant="outline" className="gap-2">
                Explore sample dashboard
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </section>

        <section id="models" className="space-y-8">
          <div className="flex flex-col gap-4 text-center">
            <Badge variant="secondary" className="mx-auto w-fit uppercase">
              Model catalog
            </Badge>
            <h2 className="text-3xl font-semibold md:text-4xl">
              Handpicked models for the use cases that matter.
            </h2>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              Each integration ships with curated presets and quality guardrails.
              Add your keys or let us manage billing for rapid onboarding.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {modelShowcase.map((model) => (
              <Card
                key={model.name}
                className="border-border/80 bg-card/70 transition hover:border-primary"
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {model.name}
                    <Badge variant="outline" className="text-xs">
                      {model.type}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{model.blurb}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="pricing" className="space-y-8">
          <div className="flex flex-col gap-4 text-center">
            <Badge variant="secondary" className="mx-auto w-fit uppercase">
              Pricing
            </Badge>
            <h2 className="text-3xl font-semibold md:text-4xl">
              Start free, scale with predictable credit bundles.
            </h2>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              Pricing aligns to the cost of underlying models. Switch plans any
              time and top-up credits as your production ramps.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {planTiers.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.accent
                    ? "border-primary bg-primary text-primary-foreground shadow-xl"
                    : "border-border/70 bg-card/70 shadow-sm"
                }
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-semibold">
                      {plan.name}
                    </CardTitle>
                    {plan.accent ? (
                      <Badge
                        variant="secondary"
                        className="rounded-full border border-primary/20 bg-primary-foreground/15 text-xs text-primary-foreground"
                      >
                        Most popular
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-4xl font-semibold">{plan.price}</span>
                    <span className="ml-2 text-sm opacity-80">{plan.period}</span>
                  </div>
                  <CardDescription
                    className={
                      plan.accent ? "text-primary-foreground/80" : undefined
                    }
                  >
                    {plan.accent
                      ? "For teams producing content weekly."
                      : "Experiment confidently and scale when ready."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3 text-sm">
                    {plan.bullet.map((perk) => (
                      <li
                        key={perk}
                        className="flex items-center gap-2"
                      >
                        <Check className="h-4 w-4" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={plan.accent ? "secondary" : "outline"}
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="resources"
          className="grid gap-10 rounded-3xl border bg-muted/40 p-10 md:grid-cols-[1fr,1.2fr]"
        >
          <div className="space-y-4">
            <Badge variant="secondary" className="uppercase">
              Resources
            </Badge>
            <h2 className="text-3xl font-semibold md:text-4xl">
              Fast answers and battle-tested best practices.
            </h2>
            <p className="text-base text-muted-foreground">
              Browse our knowledge base, learn how to shape prompts for each
              model, and stay posted on new releases.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2">
                Visit knowledge base
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="gap-2">
                Join Slack community
                <Workflow className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div
                key={faq.question}
                className="rounded-2xl border bg-card/80 p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                    <Puzzle className="h-4 w-4" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold">
                      {index + 1}. {faq.question}
                    </h3>
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="rounded-3xl border bg-primary p-10 text-primary-foreground">
          <div className="flex flex-col gap-6 text-center md:flex-row md:items-center md:justify-between md:text-left">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold">
                Ready to ship your next campaign with AI?
              </h2>
              <p className="text-base text-primary-foreground/80">
                Book a guided tour and we’ll help map PixelFoundry to your current
                workflow in under a week.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <Button variant="secondary" size="lg" asChild>
                <Link href="/dashboard">Launch Studio</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/contact">Book a call</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

