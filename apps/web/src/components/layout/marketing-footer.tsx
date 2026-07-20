import Link from "next/link"
import Image from "next/image"
import { Coffee } from "lucide-react"

const GITHUB_URL = "https://github.com/code-by-gunnar/velo-test-management"
const KOFI_URL = "https://ko-fi.com/gunnarfinkeldeh"

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/velo-mark.svg" alt="" aria-hidden="true" width={20} height={20} />
            <span className="font-display text-sm font-semibold text-gray-900">Velo</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-sm text-gray-500 transition-colors hover:text-gray-900">GitHub</a>
            <a href={`${GITHUB_URL}#quickstart`} target="_blank" rel="noreferrer" className="text-sm text-gray-500 transition-colors hover:text-gray-900">Quickstart</a>
            <a href={`${GITHUB_URL}/blob/master/LICENSE`} target="_blank" rel="noreferrer" className="text-sm text-gray-500 transition-colors hover:text-gray-900">MIT License</a>
            <a href="mailto:support@runvelo.app" className="text-sm text-gray-500 transition-colors hover:text-gray-900">Contact</a>
            <a href={KOFI_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-primary">
              <Coffee size={14} aria-hidden="true" /> Support
            </a>
          </nav>
        </div>
        <div className="mt-8 border-t border-gray-100 pt-6 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Velo · Open-source test management, MIT-licensed. Built for QA teams that ship.
        </div>
      </div>
    </footer>
  )
}
