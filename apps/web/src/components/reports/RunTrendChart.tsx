interface RunTrendEntry {
  run_id: string
  run_name: string
  completed_at: string
  total: number
  pass: number
  fail: number
  blocked: number
  skipped: number
  pass_rate: number
}

interface RunTrendChartProps {
  data: RunTrendEntry[]
}

const CHART_HEIGHT = 100
const BAR_GAP = 4
const PADDING = { top: 24, right: 48, bottom: 48, left: 40 }

// Status colors matching tailwind config tokens
const COLORS = {
  pass: "#3D9970",
  fail: "#C0392B",
  blocked: "#D4820C",
  skipped: "#8B8680",
}

const TREND_COLOR = "#2D7FF9" // primary

export function RunTrendChart({ data }: RunTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-400">
        No completed runs yet. Complete a test run to see trends.
      </div>
    )
  }

  const width = Math.max(600, data.length * 50)
  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = CHART_HEIGHT

  const maxTotal = Math.max(...data.map((d) => d.total), 1)
  const barWidth = Math.max(12, (chartWidth - BAR_GAP * (data.length - 1)) / data.length)

  // Y-axis scale for bar counts
  const yScale = (val: number) => (val / maxTotal) * chartHeight

  // Trend line points (pass_rate on 0-100 scale mapped to chart height)
  const trendPoints = data.map((d, i) => {
    const x = PADDING.left + i * (barWidth + BAR_GAP) + barWidth / 2
    const y = PADDING.top + chartHeight - (d.pass_rate / 100) * chartHeight
    return `${x},${y}`
  }).join(" ")

  // Y-axis tick values
  const yTicks = [0, Math.round(maxTotal / 2), maxTotal]
  const pctTicks = [0, 50, 100]

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT + PADDING.top + PADDING.bottom}`}
        className="w-full"
        style={{ minWidth: `${Math.min(width, 600)}px` }}
      >
        {/* Y-axis labels (left — counts) */}
        {yTicks.map((tick) => (
          <text
            key={`y-${tick}`}
            x={PADDING.left - 8}
            y={PADDING.top + chartHeight - yScale(tick) + 4}
            textAnchor="end"
            className="fill-gray-400"
            fontSize={10}
          >
            {tick}
          </text>
        ))}

        {/* Y-axis labels (right — percentage) */}
        {pctTicks.map((tick) => (
          <text
            key={`pct-${tick}`}
            x={PADDING.left + chartWidth + 8}
            y={PADDING.top + chartHeight - (tick / 100) * chartHeight + 4}
            textAnchor="start"
            className="fill-gray-400"
            fontSize={10}
          >
            {tick}%
          </text>
        ))}

        {/* Horizontal grid lines */}
        {yTicks.map((tick) => (
          <line
            key={`grid-${tick}`}
            x1={PADDING.left}
            y1={PADDING.top + chartHeight - yScale(tick)}
            x2={PADDING.left + chartWidth}
            y2={PADDING.top + chartHeight - yScale(tick)}
            stroke="#E5E7EB"
            strokeDasharray="4 4"
          />
        ))}

        {/* Stacked bars */}
        {data.map((d, i) => {
          const x = PADDING.left + i * (barWidth + BAR_GAP)
          const baseY = PADDING.top + chartHeight

          // Stack order: pass (bottom) → fail → blocked → skipped (top)
          const segments = [
            { count: d.pass, color: COLORS.pass },
            { count: d.fail, color: COLORS.fail },
            { count: d.blocked, color: COLORS.blocked },
            { count: d.skipped, color: COLORS.skipped },
          ]

          let currentY = baseY
          const rects = segments.map((seg, si) => {
            const h = yScale(seg.count)
            currentY -= h
            return (
              <rect
                key={si}
                x={x}
                y={currentY}
                width={barWidth}
                height={Math.max(h, 0)}
                fill={seg.color}
                rx={si === segments.length - 1 || (si < segments.length - 1 && segments.slice(si + 1).every(s => s.count === 0)) ? 2 : 0}
              />
            )
          })

          // X-axis label (run name, truncated)
          const label = d.run_name.length > 8 ? d.run_name.slice(0, 7) + "…" : d.run_name

          return (
            <g key={d.run_id}>
              {rects}
              <text
                x={x + barWidth / 2}
                y={baseY + 14}
                textAnchor="middle"
                className="fill-gray-500"
                fontSize={9}
              >
                {label}
              </text>
              <text
                x={x + barWidth / 2}
                y={baseY + 26}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize={8}
              >
                {new Date(d.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            </g>
          )
        })}

        {/* Pass rate trend line */}
        <polyline
          points={trendPoints}
          fill="none"
          stroke={TREND_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Trend line dots */}
        {data.map((d, i) => {
          const x = PADDING.left + i * (barWidth + BAR_GAP) + barWidth / 2
          const y = PADDING.top + chartHeight - (d.pass_rate / 100) * chartHeight
          return (
            <g key={`dot-${d.run_id}`}>
              <circle cx={x} cy={y} r={3.5} fill="white" stroke={TREND_COLOR} strokeWidth={2} />
              <title>{d.run_name}: {d.pass_rate}% pass rate</title>
            </g>
          )
        })}

        {/* Baseline */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + chartHeight}
          x2={PADDING.left + chartWidth}
          y2={PADDING.top + chartHeight}
          stroke="#D1D5DB"
        />
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.pass }} />
          Pass
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.fail }} />
          Fail
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.blocked }} />
          Blocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.skipped }} />
          Skipped
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-1 rounded-full" style={{ backgroundColor: TREND_COLOR }} />
          Pass Rate
        </span>
      </div>
    </div>
  )
}
