import Link from "next/link"
import Head from "next/head"
import Image from "next/image"
import { Button } from "@/components/ui"
import { ArrowRight } from "lucide-react"

const features = [
  {
    title: "AI Spec-to-Test Conversion",
    description: "Paste a Linear issue ID and AI generates structured test cases from the acceptance criteria. Traditional steps or BDD — your choice. Review, tweak, import. Specs become tests before the sprint starts.",
    screenshot: "/screenshots/test-cases-traditional.png",
    alt: "Velo test cases list with suites, priorities, and step counts",
  },
  {
    title: "Native Given-When-Then Editor",
    description: "Pick your format at project creation. GWT projects get a keyword-aware editor with auto-suggested steps — Given, When, Then, And, But. No plugins, no Gherkin parser. Built in.",
    screenshot: "/screenshots/test-cases-gwt.png",
    alt: "Velo GWT test cases with BDD keyword steps",
  },
  {
    title: "Live Execution Dashboard",
    description: "Execute test runs with keyboard shortcuts or clickable status buttons. Upload evidence, log defects to Linear with one click, and see results update in real time via server-sent events.",
    screenshot: "/screenshots/test-runs.png",
    alt: "Velo test runs with pass rates and status tracking",
  },
  {
    title: "Reports That Surface Real Risk",
    description: "Pass rate trend across runs, most failing test cases in the last 30 days, and a compact recent runs summary. Three sections, zero configuration. The data POs actually ask for before every release.",
    screenshot: "/screenshots/reports.png",
    alt: "Velo reports dashboard with trend chart and fragile areas",
  },
  {
    title: "Linear Integration That Works",
    description: "Log a defect during execution — it creates a Linear issue tagged with Bug, attaches your evidence screenshots automatically, and shows the VEL-XX link inline. Two-way status sync keeps everything current.",
    screenshot: "/screenshots/settings-integrations.png",
    alt: "Velo Linear integration settings with API key configuration",
  },
]

export default function FeaturesPage() {
  return (
    <>
      <Head>
        <title>Features — Velo Test Management</title>
        <meta name="description" content="AI spec-to-test conversion, native BDD editor, live execution dashboard, real-time reports, and Linear integration. See how Velo works." />
      </Head>

      <div className="min-h-screen bg-mist font-body">
        {/* Navigation */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <Image src="/velo-mark-cobalt.svg" alt="" aria-hidden="true" width={26} height={26} priority />
                <span className="text-lg font-semibold text-gray-900 font-display">Velo</span>
              </Link>
              <nav className="flex items-center gap-3">
                <Link href="/why-velo" className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors px-2.5 py-1.5">
                  Why Velo
                </Link>
                <Link href="/features" className="text-sm font-medium text-primary px-2.5 py-1.5">
                  Features
                </Link>
                <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors px-2.5 py-1.5">
                  Pricing
                </Link>
                <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors px-2.5 py-1.5">
                  Sign In
                </Link>
                <Link href="/signup">
                  <Button variant="primary" size="sm">Get Started</Button>
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main>
          {/* Hero */}
          <section className="pt-20 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-6 font-display">
                See Velo{" "}
                <span className="text-primary">in action.</span>
              </h1>
              <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                Real product screenshots. No mockups, no stock illustrations.
                This is what your QA workflow looks like with Velo.
              </p>
            </div>
          </section>

          {/* Feature sections */}
          {features.map((feature, i) => (
            <section
              key={feature.title}
              className={`py-16 px-4 sm:px-6 lg:px-8 ${i % 2 === 0 ? "" : "bg-white border-y border-gray-200"}`}
            >
              <div className="max-w-6xl mx-auto">
                <div className={`flex flex-col ${i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-10 lg:gap-16`}>
                  {/* Text */}
                  <div className="lg:w-2/5 text-center lg:text-left">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 font-display">
                      {feature.title}
                    </h2>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Screenshot */}
                  <div className="lg:w-3/5">
                    <div className="rounded-xl border border-gray-200 shadow-card overflow-hidden bg-white">
                      <Image
                        src={feature.screenshot}
                        alt={feature.alt}
                        width={1440}
                        height={900}
                        className="w-full h-auto"
                        quality={90}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}

          {/* CTA */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-gray-900 rounded-xl px-8 py-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                  Ready to try it yourself?
                </h2>
                <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">
                  Free during beta. No credit card, no seat limits.
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

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <Image src="/velo-mark-cobalt.svg" alt="" aria-hidden="true" width={22} height={22} />
                <span className="text-sm font-semibold text-gray-900 font-display">Velo</span>
              </div>
              <nav className="flex items-center gap-6" aria-label="Footer">
                <Link href="/why-velo" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Why Velo</Link>
                <Link href="/features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Features</Link>
                <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Sign In</Link>
                <Link href="/signup" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Sign Up</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Privacy</Link>
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
