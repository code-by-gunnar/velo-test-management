import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { clsx } from "clsx"
import { Menu, X } from "lucide-react"

const NAV_LINKS = [
  { href: "/why-velo", label: "Why Velo" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
]

interface MarketingNavProps {
  activePath?: string
}

export function MarketingNav({ activePath }: MarketingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/velo-mark-cobalt.svg" alt="" aria-hidden="true" width={40} height={40} priority />
            <span className="text-lg font-semibold text-gray-900 font-display">Velo</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "text-sm font-medium rounded-md transition-colors px-2.5 py-1.5",
                  activePath === link.href
                    ? "text-primary"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="sm:hidden flex items-center justify-center w-9 h-9 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  "text-sm font-medium rounded-md px-3 py-2 transition-colors",
                  activePath === link.href
                    ? "text-primary bg-primary-selected"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
