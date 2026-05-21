import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
        critical: "border-transparent bg-purple-500/20 text-purple-300 border-purple-500/30",
        high: "border-transparent bg-red-500/20 text-red-300 border-red-500/30",
        medium: "border-transparent bg-amber-500/20 text-amber-300 border-amber-500/30",
        low: "border-transparent bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        adequate: "border-transparent bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        concern: "border-transparent bg-red-500/20 text-red-300 border-red-500/30",
        improvement: "border-transparent bg-amber-500/20 text-amber-300 border-amber-500/30",
        blue: "border-transparent bg-blue-500/20 text-blue-300 border-blue-500/30",
        cyan: "border-transparent bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
