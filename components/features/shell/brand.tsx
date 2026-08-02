import Image from "next/image"

import { cn } from "@/lib/utils"

// Text-based brand lockup so we can position the green status dot precisely
// after the trailing "w" of "HubFlow" — impossible with the SVG lockup because
// the "w" glyph's edge is opaque to the layout.
export function BrandLockup({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const wordSize =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl"
  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      <span className={cn("font-bold tracking-tight text-white", wordSize)}>HubFlow</span>
      <StatusDot />
    </div>
  )
}

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/hubflow_a.svg"
        alt="HubFlow"
        fill
        sizes={`${size}px`}
        className="object-contain p-1"
      />
    </div>
  )
}

export function StatusDot() {
  return (
    <span className="relative flex size-2 shrink-0 self-center">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
    </span>
  )
}
