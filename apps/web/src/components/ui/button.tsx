import { cva, type VariantProps } from "class-variance-authority"
import { clsx } from "clsx"
import type { ButtonHTMLAttributes } from "react"

const buttonVariants = cva(
  // Base styles applied to all variants
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover",
        secondary: "bg-white text-primary border border-primary hover:bg-primary-selected active:bg-primary-selected",
        destructive: "bg-fail-bg text-fail-text border border-fail/20 hover:bg-fail/10",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        sm: "h-7 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
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
