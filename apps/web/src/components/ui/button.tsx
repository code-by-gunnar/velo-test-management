import { cva, type VariantProps } from "class-variance-authority"
import { clsx } from "clsx"
import type { ButtonHTMLAttributes } from "react"

const buttonVariants = cva(
  // Base styles applied to all variants
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-cobalt text-white hover:bg-cobalt-dark active:bg-cobalt-dark",
        secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100",
        destructive: "bg-fail-bg text-fail-text border border-fail/20 hover:bg-red-100",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        sm: "h-7 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
