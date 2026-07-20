import Head from "next/head"
import { Star, ArrowRight } from "lucide-react"
import { MarketingNav } from "@/components/layout/marketing-nav"
import { MarketingFooter } from "@/components/layout/marketing-footer"

const GITHUB_URL = "https://github.com/code-by-gunnar/velo-test-management"

const refusals = [
  { no: "No per-seat pricing.", detail: "Self-host it and invite the whole team." },
  { no: "No sprawling integration marketplace.", detail: "Just the few that matter, done well." },
  { no: "No Gantt charts or planning modules.", detail: "" },
  { no: "No sales call to get started.", detail: "Clone it and go." },
  { no: "No lock-in.", detail: "Your data stays in your Postgres — take it with you anytime." },
]

const capabilities = [
  {
    tag: "// capture",
    title: "Write cases fast",
    body: "A keyboard-first editor. Steps or Given-When-Then, set per project. Tab, type, done. No mouse required.",
  },
  {
    tag: "// run",
    title: "Run them live",
    body: "Execution updates over SSE, not polling. Pass, fail, or block with one key. Attach a screenshot, file the Linear defect, and the evidence rides along.",
  },
  {
    tag: "// see",
    title: "Know where you stand",
    body: "Pass rates and trends the moment someone records a verdict. No status meeting to find out.",
  },
  {
    tag: "// connect",
    title: "Bring your own AI",
    body: "Paste a Linear issue; your key turns the acceptance criteria into cases. Claude, OpenAI, or a local model. JUnit and Allure ingest from any CI.",
  },
]

const selfHostPoints = [
  "One Docker command. Your Postgres, your data.",
  "Your own AI keys — Claude, OpenAI, or a model on your LAN.",
  "Analytics, error tracking, email: off until you switch them on. Nothing phones home.",
  "Free. MIT-licensed. Fork it if you want.",
]

export default function Home() {
  return (
    <>
      <Head>
        <title>Velo — Open-source, self-hosted test management</title>
        <meta
          name="description"
          content="The QA tool that does the part you actually use — write cases, run them, see where you stand — and skips the bloat. Open-source, self-hosted, MIT-licensed."
        />
      </Head>

      <div className="min-h-screen bg-mist font-body text-gray-900">
        <MarketingNav />

        <main>
          {/* ── Hero ─────────────────────────────────────────────── */}
          <header className="px-4 pb-28 pt-24 sm:px-6 sm:pt-32 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <p className="rise font-mono text-xs tracking-wide text-primary">open source · self-hosted · yours</p>
              <h1 className="rise rise-1 mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-gray-900 sm:text-6xl">
                Test management that
                <br />
                <span className="text-primary">does less, on purpose.</span>
              </h1>
              <p className="rise rise-2 mt-7 max-w-xl text-lg leading-relaxed text-gray-600">
                Open-source, self-hosted test management, focused on what QA teams do every day: write the scenarios, run
                them, and see where you stand. Not much else, and that&rsquo;s the point.
              </p>
              <div className="rise rise-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#self-host"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  Deploy with Docker <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-400"
                >
                  <Star size={16} aria-hidden="true" /> View on GitHub
                </a>
              </div>
              <p className="rise rise-4 mt-9 inline-flex items-center gap-2 border-t border-dashed border-gray-300 pt-5 font-mono text-sm text-gray-500">
                <span className="text-gray-400">$</span> docker compose up{" "}
                <span className="text-primary">&rarr;</span> localhost:3000
              </p>
            </div>
          </header>

          {/* ── The frustration ──────────────────────────────────── */}
          <section id="why" className="border-y border-gray-200 bg-white px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900">
                I kept paying for tools we barely used.
              </h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-600">
                <p>
                  For years, every team I joined bought the same kind of thing: a big test-management suite, enterprise
                  pricing, a long onboarding. And every time, we settled into a small slice of it. Write cases, run them,
                  log defects.
                </p>
                <p>
                  The rest mostly sat there. The open-source options didn&rsquo;t fit either &mdash; capable, but heavy and
                  awkward to live in. So I built something smaller, around the slice we actually used.
                </p>
              </div>
              <p className="mt-8 rounded-lg border border-gray-200 bg-mist px-5 py-4 font-mono text-sm text-gray-900">
                a big license <span className="text-gray-400">·</span> a long onboarding{" "}
                <span className="text-gray-400">·</span> <span className="text-primary">a fraction actually used</span>
              </p>
            </div>
          </section>

          {/* ── What it refuses ──────────────────────────────────── */}
          <section id="refuses" className="px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900">What Velo leaves out.</h2>
              <p className="mt-3 text-base text-gray-500">The things it skips are on purpose.</p>
              <ul className="mt-9">
                {refusals.map((r) => (
                  <li key={r.no} className="flex items-baseline gap-4 border-b border-gray-100 py-4 text-lg">
                    <span aria-hidden="true" className="w-5 shrink-0 font-mono text-sm font-bold text-primary">
                      &times;
                    </span>
                    <span className="text-gray-900">
                      <span className="font-semibold">{r.no}</span>
                      {r.detail ? <span className="text-gray-500"> {r.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── What it is ───────────────────────────────────────── */}
          <section id="what" className="border-y border-gray-200 bg-white px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-gray-900">
                The essentials, done properly.
              </h2>
              <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
                {capabilities.map((c) => (
                  <div key={c.title}>
                    <p className="font-mono text-xs text-primary">{c.tag}</p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-gray-900">{c.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{c.body}</p>
                  </div>
                ))}
              </div>

              {/* Product glimpse — real tokens, no screenshot */}
              <div className="mt-14 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="ml-2 font-mono text-xs text-gray-400">Checkout suite · 24 cases</span>
                </div>
                <div className="p-2">
                  <GlimpseRow selected title="Guest can complete checkout with a saved card" dot="bg-fail" priority="Critical" steps="4 steps" />
                  <GlimpseRow title="Given an empty cart · When a coupon is applied · Then it is rejected" dot="bg-blocked" priority="High" steps="3 steps" />
                  <GlimpseRow title="Order confirmation email fires within 30 seconds" dot="bg-pass" priority="Medium" steps="2 steps" />
                </div>
              </div>
            </div>
          </section>

          {/* ── Self-host ────────────────────────────────────────── */}
          <section id="self-host" className="px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="font-mono text-xs text-primary">{"// self-host"}</p>
                <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-gray-900">
                  Runs on your machine.
                  <br />
                  Your data stays yours.
                </h2>
                <ul className="mt-7 space-y-3">
                  {selfHostPoints.map((point, i) => (
                    <li key={point} className="flex gap-3 text-gray-600">
                      <span className="shrink-0 font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={`${GITHUB_URL}#quickstart`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                  >
                    Read the quickstart <ArrowRight size={16} aria-hidden="true" />
                  </a>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-400"
                  >
                    <Star size={16} aria-hidden="true" /> GitHub
                  </a>
                </div>
              </div>

              {/* Terminal — the one deliberate dark moment */}
              <div className="rounded-xl bg-gray-900 p-5 shadow-xl">
                <div className="mb-4 flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
                </div>
                <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-gray-200">
                  <span className="text-gray-500"># clone, set three secrets, up</span>
                  {"\n"}git clone {GITHUB_URL.replace("https://", "")}
                  {"\n"}cp .env.example .env
                  {"\n"}docker compose \
                  {"\n"}  -f docker-compose.yml \
                  {"\n"}  -f docker-compose.app.yml up -d
                  {"\n"}
                  {"\n"}<span className="text-pass">&#10003;</span> web{"  "}<span className="text-primary">&rarr;</span> localhost:3000
                  {"\n"}<span className="text-pass">&#10003;</span> api{"  "}<span className="text-primary">&rarr;</span> localhost:3001
                </pre>
              </div>
            </div>
          </section>

          {/* ── Close ────────────────────────────────────────────── */}
          <section className="border-t border-gray-200 bg-white px-4 py-24 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                See if it fits.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-gray-500">
                Clone it, run it, and find out in about five minutes.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  href="#self-host"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  Deploy with Docker <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-400"
                >
                  <Star size={16} aria-hidden="true" /> Star on GitHub
                </a>
              </div>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>

      {/* Quiet hero settle — a single, staggered entrance. Honors reduced-motion. */}
      <style jsx global>{`
        .rise {
          opacity: 0;
          transform: translateY(14px);
          animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .rise-1 { animation-delay: 0.08s; }
        .rise-2 { animation-delay: 0.16s; }
        .rise-3 { animation-delay: 0.26s; }
        .rise-4 { animation-delay: 0.36s; }
        @keyframes rise {
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rise { opacity: 1; transform: none; animation: none; }
        }
      `}</style>
    </>
  )
}

function GlimpseRow({
  title,
  dot,
  priority,
  steps,
  selected = false,
}: {
  title: string
  dot: string
  priority: string
  steps: string
  selected?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${selected ? "bg-primary-selected" : ""}`}
    >
      <span aria-hidden="true" className="font-mono text-gray-300">
        &#10303;
      </span>
      <span className={`flex-1 ${selected ? "font-medium text-primary" : "text-gray-900"}`}>{title}</span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-mist px-2 py-0.5 text-xs font-medium text-gray-600">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {priority}
      </span>
      <span className="hidden font-mono text-xs text-gray-400 sm:inline">{steps}</span>
    </div>
  )
}
