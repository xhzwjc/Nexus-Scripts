import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 dark:disabled:opacity-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[#334155] text-primary-foreground shadow-[0_2px_6px_rgba(51,65,85,0.2)] hover:bg-[#263448] dark:bg-primary dark:shadow-[0_2px_6px_rgba(0,0,0,0.35)] dark:hover:bg-[#6E88FF] dark:active:bg-[#4A64E8] dark:disabled:border-[#2A2F3A] dark:disabled:bg-[#2A2F3A] dark:disabled:text-[#5A5E67]",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-[#F53F3F] dark:hover:bg-[#FF5A5A] dark:active:bg-[#DE2E2E] dark:disabled:border-[rgba(245,63,63,0.18)] dark:disabled:bg-[rgba(245,63,63,0.18)] dark:disabled:text-[#8A5252]",
        outline:
          "border border-[var(--tr-border)] bg-white text-[var(--tr-ink)] shadow-none hover:border-[#cbd5e1] hover:bg-slate-50 hover:text-[var(--tr-ink)] dark:border-[#3A3F49] dark:bg-transparent dark:text-[#C7C9D0] dark:hover:border-[#4A505C] dark:hover:bg-white/[0.07] dark:hover:text-[#E8EAED] dark:active:border-[#4A505C] dark:active:bg-white/[0.04] dark:disabled:border-[#2A2F3A] dark:disabled:bg-transparent dark:disabled:text-[#5A5E67]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
