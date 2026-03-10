import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui"

const features = [
  {
    title: "Keyboard-First Editor",
    description:
      "Write test cases in under 30 seconds. Steps, expected results, priorities — no clicking through menus.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-cobalt"
      >
        <rect
          x="2"
          y="6"
          width="20"
          height="12"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M6 10h1M10 10h1M14 10h1M18 10h1M6 14h1M10 14h5M17 14h1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Live Run Dashboard",
    description:
      "Real-time progress tracking with SSE. Pass rates update as your team executes. No page refreshes.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-cobalt"
      >
        <path
          d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 7v5l3 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="3" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "CI/CD That Just Works",
    description:
      "Push JUnit XML or Allure JSON from any pipeline. Results auto-map to your test cases.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-cobalt"
      >
        <path
          d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-mist font-ui">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/velo-mark-cobalt.svg"
                alt=""
                aria-hidden="true"
                width={28}
                height={28}
                priority
              />
              <span className="text-lg font-semibold text-slate-900">Velo</span>
            </Link>
            <nav className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-slate-900 transition-colors px-2 py-1"
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
        {/* Hero */}
        <section className="pt-20 pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex justify-center mb-10">
              <Image
                src="/velo-mark-cobalt.svg"
                alt=""
                aria-hidden="true"
                width={72}
                height={72}
                priority
              />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-6">
              QA doesn&apos;t belong at the end of the line.{" "}
              <span className="text-cobalt">
                It belongs in the chain from day one.
              </span>
            </h1>
            <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
              30 seconds to a test case. Live run tracking. Zero surprises on
              release day.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup">
                <Button variant="primary" size="lg">
                  Get Started Free
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Feature divider */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border-t border-gray-200" />
        </div>

        {/* Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm p-6"
                >
                  <div className="w-10 h-10 rounded-lg bg-cobalt-light flex items-center justify-center mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2">
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

        {/* Footer CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-8 py-12">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-4">
                Your team moves fast. Your QA should too.
              </p>
              <h2 className="text-3xl font-bold text-slate-900 mb-8">
                Ship with confidence, not crossed fingers.
              </h2>
              <Link href="/signup">
                <Button variant="primary" size="lg">
                  Start for Free
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/velo-mark-cobalt.svg"
                alt=""
                aria-hidden="true"
                width={24}
                height={24}
              />
              <span className="text-base font-semibold text-slate-900">Velo</span>
            </Link>
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Velo. Built for QA teams that
              ship.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
