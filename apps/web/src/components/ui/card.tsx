import { clsx } from "clsx"
import type { HTMLAttributes } from "react"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg"
}

export function Card({ className, padding = "md", children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-md border border-gray-200 bg-white shadow-card",
        {
          "p-3": padding === "sm",
          "p-5": padding === "md",
          "p-8": padding === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("mb-4 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx("text-sm font-semibold text-gray-900", className)} {...props}>
      {children}
    </h3>
  )
}
