import Link from "next/link"
import Head from "next/head"
import { Button } from "@/components/ui"
import { ArrowRight, Sparkles, Keyboard, TrendingDown, X } from "lucide-react"
import { MarketingNav } from "@/components/layout/marketing-nav"
import { MarketingFooter } from "@/components/layout/marketing-footer"

const stats = [
  { value: "75%", label: "of testing problems trace to requirements, not tools", source: "TestGuild Survey" },
  { value: "67%", label: "trust AI-generated tests only with human review", source: "TestGuild Survey" },
  { value: "40%", label: "of tester time spent preparing and managing test data", source: "Industry Reports" },
  { value: "25%", label: "automation coverage plateau — most testing is still manual", source: "Forrester" },
  { value: "81%", label: "of executives tie quality directly to revenue outcomes", source: "World Quality Report" },
  { value: "72%", label: "say AI-powered testing is their top priority", source: "Industry Survey" },
]

const nonFeatures = [
  { what: "Requirements management", why: "Your issue tracker already does this. Duplicating it adds bloat, not value." },
  { what: "Self-healing tests", why: "That's your automation framework's job. Playwright and Cypress do it better than we ever would." },
  { what: "Autonomous test execution", why: "CI runners execute tests. Velo tracks results. Clear ownership, no overlap." },
  { what: "50 configurable reports", why: "Three reports that answer real questions beat fifty that nobody reads." },
  { what: "Jira integration", why: "We integrate with Linear because that's what modern teams use. Jira support may come later." },
]

export default function WhyVeloPage() {
  return (
    <>
      <Head>
        <title>Why Velo — The Testing Problem Nobody Talks About</title>
        <meta name="description" content="75% of testing problems trace to requirements, not tools. Velo is the only test management tool that acts on this. AI converts specs to tests. Keyboard-first speed. Fragile areas surfaced." />
      </Head>

      <div className="min-h-screen bg-mist font-body">
        <MarketingNav activePath="/why-velo" />

        <main>
          {/* ── Section 1: The Problem ──────────────────────────────────────── */}
          <section className="pt-20 sm:pt-28 pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-6 font-display">
                Most QA tools solve{" "}
                <br className="hidden sm:block" />
                the <span className="text-primary">wrong problem.</span>
              </h1>

              <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed mb-8">
                The industry is drowning in tools that make test execution faster.
                But 75% of testing problems trace back to ambiguous requirements — not slow execution.
                More speed on unclear specs is just fast confusion.
              </p>

              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-3 shadow-card">
                <span className="text-sm text-gray-500">
                  &ldquo;Fast testing of unclear requirements is just fast confusion.&rdquo;
                </span>
              </div>
            </div>
          </section>

          {/* ── Section 2: What We Built Instead ──────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-gray-200">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-16">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What we built instead</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  Three things no other tool does.
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Differentiator 1 */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-900 text-white mb-5">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-3 font-display">
                    Spec to test in seconds
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Paste a Linear issue ID. AI reads the acceptance criteria and generates
                    structured test cases — traditional steps or BDD. You review, tweak, and import.
                    The spec becomes test cases before the sprint starts.
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    Research says AI-assisted requirements analysis delivers higher ROI than
                    speeding up test execution. This is the only tool that acts on that finding.
                  </p>
                </div>

                {/* Differentiator 2 */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-900 text-white mb-5">
                    <Keyboard size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-3 font-display">
                    30 seconds to a test case
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Tab through steps. Enter to add. Backspace to remove. No clicking through
                    modal wizards or multi-step forms. The editor gets out of your way because
                    writing test cases should feel like writing, not configuring.
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    The QA community&apos;s #1 complaint is tools that are &ldquo;bloated with
                    tech debt&rdquo; where simple tasks take a frustrating amount of time.
                  </p>
                </div>

                {/* Differentiator 3 */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-900 text-white mb-5">
                    <TrendingDown size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-3 font-display">
                    Fragile areas, not green dashboards
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Reports show the test cases that fail most across runs — the areas that keep
                    breaking during regression. When your PO asks &ldquo;what keeps breaking?&rdquo;
                    you have the answer in one table, not a 30-minute spreadsheet exercise.
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    The industry warns about &ldquo;dashboards that glow green while risk
                    quietly accumulates.&rdquo; Velo surfaces the risk.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: The Data ──────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">The data</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  Numbers that shaped how we built Velo.
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {stats.map((stat) => (
                  <div
                    key={stat.value}
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-card"
                  >
                    <p className="text-3xl font-bold text-gray-900 font-display mb-2">{stat.value}</p>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">{stat.label}</p>
                    <p className="text-xs text-gray-400">{stat.source}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Section 4: What We Don't Do ────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-gray-200">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">On purpose</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  What we deliberately left out.
                </h2>
                <p className="mt-3 text-sm text-gray-500 max-w-lg mx-auto">
                  A tool that tries to do everything ends up being the bloated mess
                  everyone complains about. These are intentional choices.
                </p>
              </div>

              <div className="space-y-4">
                {nonFeatures.map((item) => (
                  <div
                    key={item.what}
                    className="flex items-start gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 shrink-0 mt-0.5">
                      <X size={12} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.what}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{item.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Section 5: CTA ──────────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-gray-900 rounded-xl px-8 py-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                  Built for the QA engineer{" "}
                  <br className="hidden sm:block" />
                  who thinks, not just clicks.
                </h2>
                <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">
                  The safest testing career in 2026 is built on judgment, not throughput.
                  Velo is the tool for that career.
                </p>
                <Link href="/features">
                  <Button variant="primary" size="lg">
                    Explore Features
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  )
}
