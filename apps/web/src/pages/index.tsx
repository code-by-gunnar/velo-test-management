import { clsx } from "clsx"
import Link from "next/link"
import Head from "next/head"
import Image from "next/image"
import { Button } from "@/components/ui"
import {
  Keyboard,
  Activity,
  GitBranch,
  Zap,
  ArrowRight,
  ClipboardList,
  Play,
  BarChart3,
  FlaskConical,
  Sparkles,
} from "lucide-react"

const features = [
  {
    title: "Spec to Test in Seconds",
    description:
      "Paste a Linear issue ID. AI reads the acceptance criteria and generates test cases — traditional steps or BDD. Review, tweak, import. Your specs become tests before the sprint starts.",
    icon: <Sparkles size={20} />,
    highlight: true,
  },
  {
    title: "Keyboard-First Test Editor",
    description:
      "Tab, Enter, Backspace — that's it. Write a full test case without touching your mouse. Traditional steps or Given-When-Then, your choice per project.",
    icon: <Keyboard size={20} />,
  },
  {
    title: "Native BDD / Given-When-Then",
    description:
      "Not a plugin. Not a Gherkin file parser. Pick your format at project creation and get a keyword-aware editor with auto-suggested steps. Import BDD scenarios from CSV.",
    icon: <FlaskConical size={20} />,
  },
  {
    title: "Live Execution Dashboard",
    description:
      "Server-sent events, not polling. Pass rates, blockers, and team progress update the instant someone records a verdict. No refresh, no stale data.",
    icon: <Activity size={20} />,
  },
  {
    title: "CI Pipeline Ingestion",
    description:
      "Push JUnit XML or Allure JSON from any CI runner. Results map to your cases automatically. No adapters, no paid add-ons, no YAML config files.",
    icon: <GitBranch size={20} />,
  },
  {
    title: "5-Minute Setup, No Training",
    description:
      "Create a workspace, invite your team, start writing cases. No implementation consultants, no 30-day onboarding programs, no per-seat surprise invoices.",
    icon: <Zap size={20} />,
  },
]

const steps = [
  {
    number: "01",
    title: "Write your cases",
    description: "Create test cases with the keyboard-first editor. Add steps, expected results, and priorities in seconds.",
    icon: <ClipboardList size={24} />,
  },
  {
    number: "02",
    title: "Run your tests",
    description: "Create a test run, assign it to your team, and execute. Pass, fail, or block each step with one click.",
    icon: <Play size={24} />,
  },
  {
    number: "03",
    title: "Ship with confidence",
    description: "See pass rates, blockers, and trends at a glance. Know exactly where you stand before every release.",
    icon: <BarChart3 size={24} />,
  },
]

const comparisons = [
  { feature: "Spec to test cases", velo: "AI-generated in seconds", others: "Manual transcription" },
  { feature: "Write a test case", velo: "< 30 seconds", others: "2+ minutes of clicking" },
  { feature: "BDD / Given-When-Then", velo: "Native, per-project", others: "Plugin or not supported" },
  { feature: "Live run tracking", velo: "Real-time (SSE)", others: "Refresh to check" },
  { feature: "CI result ingestion", velo: "Built-in, zero config", others: "Paid add-on or manual" },
  { feature: "Setup to first test case", velo: "5 minutes", others: "Days to weeks" },
  { feature: "Data export", velo: "Self-serve, one click", others: "File a support ticket" },
  { feature: "Pricing model", velo: "Free during beta, flat after", others: "$30-80/seat/month" },
  { feature: "Training required", velo: "None", others: "\"Implementation partner\"" },
]

export default function Home() {
  return (
    <>
      <Head>
        <title>Velo — Test Management for Teams That Ship</title>
        <meta name="description" content="AI converts your Linear specs into test cases in seconds. Keyboard-first editor, live run tracking, CI ingestion. Built for teams that ship weekly." />
      </Head>

      <div className="min-h-screen bg-mist font-body">
        {/* Navigation */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <Image
                  src="/velo-mark-cobalt.svg"
                  alt=""
                  aria-hidden="true"
                  width={26}
                  height={26}
                  priority
                />
                <span className="text-lg font-semibold text-gray-900 font-display">Velo</span>
              </Link>
              <nav className="flex items-center gap-3">
                <Link
                  href="/why-velo"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors px-2.5 py-1.5"
                >
                  Why Velo
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors px-2.5 py-1.5"
                >
                  Sign In
                </Link>
                <Link href="/signup">
                  <Button variant="primary" size="sm">
                    Get Started
                  </Button>
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main>
          {/* ── Hero ──────────────────────────────────────────────────────────── */}
          <section className="pt-20 sm:pt-28 pb-24 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-selected px-3 py-1 text-xs font-medium text-primary mb-8">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Now in public beta
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-6 font-display">
                QA that keeps up{" "}
                <br className="hidden sm:block" />
                with how you{" "}
                <span className="text-primary">actually ship.</span>
              </h1>

              <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
                Paste a spec, get test cases. AI converts your Linear issues
                into structured tests in seconds. Traditional steps or BDD.
                Built for teams that ship weekly, not quarterly.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/signup">
                  <Button variant="primary" size="lg">
                    Get Started Free
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="secondary" size="lg">
                    Sign In
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                No credit card required. Free while in beta.
              </p>
            </div>
          </section>

          {/* ── How it works ──────────────────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-gray-200">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">How it works</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  Three steps. Zero complexity.
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {steps.map((step, i) => (
                  <div key={step.number} className="relative text-center">
                    {/* Connector line between steps (desktop only) */}
                    {i < steps.length - 1 && (
                      <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] w-[calc(100%-80px)] border-t-2 border-dashed border-gray-200" />
                    )}

                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-card text-primary mb-5">
                      {step.icon}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">
                      Step {step.number}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2 font-display">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Features ──────────────────────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Features</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  Everything you need. Nothing you don&apos;t.
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    className={clsx(
                      "group rounded-lg p-5 transition-all hover:shadow-card",
                      "highlight" in feature && feature.highlight
                        ? "sm:col-span-2 lg:col-span-3 bg-primary-selected border border-primary/20"
                        : "bg-white border border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="w-9 h-9 rounded-md bg-primary-selected text-primary flex items-center justify-center mb-4 transition-colors group-hover:bg-primary group-hover:text-white">
                      {feature.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1.5 font-display">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Comparison ────────────────────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-gray-200">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Why Velo</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-display">
                  Built different. On purpose.
                </h2>
                <p className="mt-3 text-sm text-gray-500 max-w-lg mx-auto">
                  Most test management tools were designed for enterprises with 6-month release cycles.
                  Velo is built for teams shipping weekly.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg shadow-card overflow-hidden">
                <div className="grid grid-cols-3 text-xs font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 bg-gray-50">
                  <div className="px-5 py-3" />
                  <div className="px-5 py-3 text-primary">Velo</div>
                  <div className="px-5 py-3">Legacy tools</div>
                </div>
                {comparisons.map((row, i) => (
                  <div
                    key={row.feature}
                    className={`grid grid-cols-3 text-sm ${i < comparisons.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div className="px-5 py-3 font-medium text-gray-700">{row.feature}</div>
                    <div className="px-5 py-3 text-gray-900">
                      <span className="font-medium">{row.velo}</span>
                    </div>
                    <div className="px-5 py-3 text-gray-400">
                      {row.others}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-gray-900 rounded-xl px-8 py-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                  Ship with confidence,{" "}
                  <br className="hidden sm:block" />
                  not crossed fingers.
                </h2>
                <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">
                  Join the beta. Free for now, fair pricing later.
                  No feature gates, no seat surprises.
                </p>
                <Link href="/signup">
                  <Button variant="primary" size="lg">
                    Get Started Free
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <Image
                  src="/velo-mark-cobalt.svg"
                  alt=""
                  aria-hidden="true"
                  width={22}
                  height={22}
                />
                <span className="text-sm font-semibold text-gray-900 font-display">Velo</span>
              </div>

              <nav className="flex items-center gap-6" aria-label="Footer">
                <Link href="/why-velo" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Why Velo
                </Link>
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Sign In
                </Link>
                <Link href="/signup" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Sign Up
                </Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Privacy
                </Link>
              </nav>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Velo Test Management. Built for QA teams that ship.
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
