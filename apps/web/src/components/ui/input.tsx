import React from "react"
import { clsx } from "clsx"
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | undefined
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
        "focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error
          ? "border-fail focus:border-fail focus:ring-fail"
          : "border-gray-200",
        className
      )}
      {...props}
    />
  )
}

export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("block text-sm font-medium text-gray-700", className)}
      {...props}
    >
      {children}
    </label>
  )
}

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string | undefined
  children: React.ReactNode
}

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-fail-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
