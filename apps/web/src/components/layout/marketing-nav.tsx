import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { clsx } from "clsx"
import { Menu, X, Star } from "lucide-react"

const GITHUB_URL = "https://github.com/code-by-gunnar/velo-test-management"

const NAV_LINKS = [
  { href: "#why", label: "Why" },
  { href: "#what", label: "What it does" },
  { href: "#self-host", label: "Self-host" },
]

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-mist/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image src="/velo-mark.svg" alt="" aria-hidden="true" width={26} height={26} priority />
            <span className="font-display text-lg font-semibold text-gray-900">Velo</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                {link.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <Star size={14} aria-hidden="true" /> GitHub
            </a>
            <a
              href="#self-host"
              className="ml-1 inline-flex items-center rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Deploy
            </a>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 sm:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white sm:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {link.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Star size={14} aria-hidden="true" /> GitHub
            </a>
            <a
              href="#self-host"
              onClick={() => setMobileOpen(false)}
              className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Deploy with Docker
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
