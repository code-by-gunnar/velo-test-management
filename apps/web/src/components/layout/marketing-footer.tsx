import Link from "next/link"
import Image from "next/image"

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image src="/velo-mark-cobalt.svg" alt="" aria-hidden="true" width={22} height={22} />
            <span className="text-sm font-semibold text-gray-900 font-display">Velo</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer">
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
  )
}
