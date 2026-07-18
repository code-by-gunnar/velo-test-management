import { useEffect, useState } from "react"
import { useRouter } from "next/router"

// Pages Router blocks route transitions on the _next/data (getServerSideProps)
// round-trip with zero visual feedback — on a slow link the app looks frozen.
// This renders a thin indeterminate bar at the top of the viewport while a
// route change is in flight. The 120ms delay keeps fast navigations flicker-free.
export function RouteProgress() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const start = (_url: string, { shallow }: { shallow: boolean }) => {
      if (shallow) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setVisible(true), 120)
    }
    const stop = () => {
      if (timer) clearTimeout(timer)
      timer = null
      setVisible(false)
    }

    router.events.on("routeChangeStart", start)
    router.events.on("routeChangeComplete", stop)
    router.events.on("routeChangeError", stop)
    return () => {
      if (timer) clearTimeout(timer)
      router.events.off("routeChangeStart", start)
      router.events.off("routeChangeComplete", stop)
      router.events.off("routeChangeError", stop)
    }
  }, [router])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      role="progressbar"
      aria-label="Page loading"
    >
      <div className="h-full w-1/3 rounded-r bg-primary animate-route-progress" />
    </div>
  )
}
