import Link from "next/link"
import Head from "next/head"
import { Button } from "@/components/ui"
import { ArrowRight, Check } from "lucide-react"
import { MarketingNav } from "@/components/layout/marketing-nav"
import { MarketingFooter } from "@/components/layout/marketing-footer"

const included = [
  "Unlimited test cases",
  "Unlimited test runs",
  "AI spec-to-test (Linear import)",
  "Native BDD / Given-When-Then",
  "Live execution dashboard (SSE)",
  "CI pipeline ingestion (JUnit, Allure)",
  "Test evidence uploads",
  "Linear defect sync",
  "CSV import & export",
  "Workspace collaboration",
  "Reports & fragile areas",
]

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>Pricing — Velo Test Management</title>
        <meta name="description" content="Velo is free during beta. No credit card, no seat limits, no feature gates. Fair flat pricing when we launch." />
      </Head>

      <div className="min-h-screen bg-mist font-body">
        <MarketingNav activePath="/pricing" />

        <main>
          {/* Hero */}
          <section className="pt-20 sm:pt-28 pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-6 font-display">
                Simple pricing.{" "}
                <br className="hidden sm:block" />
                No <span className="text-primary">surprises.</span>
              </h1>
              <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                Free while in beta. When we launch, pricing will be flat
                and fair — no per-seat gotchas, no feature gates.
              </p>
            </div>
          </section>

          {/* Pricing card */}
          <section className="pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto">
              <div className="rounded-xl border border-primary/20 bg-white shadow-card p-8">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-selected px-3 py-1 text-xs font-medium text-primary mb-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Beta
                  </div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-gray-900 font-display">$0</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Everything included. No limits.
                  </p>
                </div>

                <ul className="space-y-3 mb-8">
                  {included.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <Check size={16} className="shrink-0 text-pass" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link href="/signup" className="block">
                  <Button variant="primary" size="lg" className="w-full justify-center">
                    Get Started Free
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
                <p className="mt-3 text-center text-xs text-gray-400">
                  No credit card required
                </p>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-gray-500">
                  When we move out of beta, pricing will be simple and transparent.
                  No per-seat multiplication, no enterprise-only features behind a paywall.
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Early beta users will get a permanent discount.
                </p>
              </div>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  )
}
