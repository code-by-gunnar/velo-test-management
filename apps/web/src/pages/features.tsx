import { useState } from "react"
import Link from "next/link"
import Head from "next/head"
import Image from "next/image"
import { Button } from "@/components/ui"
import { ArrowRight, X } from "lucide-react"
import { MarketingNav } from "@/components/layout/marketing-nav"
import { MarketingFooter } from "@/components/layout/marketing-footer"

const features = [
  {
    title: "AI Spec-to-Test Conversion",
    description: "Paste a Linear issue ID and AI generates structured test cases from the acceptance criteria. Traditional steps or BDD — your choice. Review, tweak, import. Specs become tests before the sprint starts.",
    screenshot: "/screenshots/linear-import.png",
    alt: "Velo AI import from Linear showing generated test cases from acceptance criteria",
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <>
      <Head>
        <title>Features — Velo Test Management</title>
        <meta name="description" content="AI spec-to-test conversion, native BDD editor, live execution dashboard, real-time reports, and Linear integration. See how Velo works." />
      </Head>

      <div className="min-h-screen bg-mist font-body">
        <MarketingNav activePath="/features" />

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

                  {/* Screenshot — click to enlarge */}
                  <div className="lg:w-3/5">
                    <button
                      type="button"
                      onClick={() => setLightboxSrc(feature.screenshot)}
                      className="w-full rounded-xl border border-gray-200 shadow-card overflow-hidden bg-white cursor-zoom-in hover:shadow-dropdown transition-shadow"
                    >
                      <Image
                        src={feature.screenshot}
                        alt={feature.alt}
                        width={1440}
                        height={900}
                        className="w-full h-auto"
                        quality={90}
                      />
                    </button>
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

        <MarketingFooter />

        {/* Lightbox */}
        {lightboxSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 cursor-zoom-out"
            onClick={() => setLightboxSrc(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X size={24} />
            </button>
            <Image
              src={lightboxSrc}
              alt="Enlarged screenshot"
              width={1440}
              height={900}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
              quality={95}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </>
  )
}
