import Image from "next/image"

import { cn } from "@/lib/utils"

// BrandMark + wordmark + status dot rendered as one row. Everything shares the
// same vertical centerline (items-center) so the enlarged mark sits flush with
// the "HubFlow" title regardless of font size.
export function BrandLockup({
  markSize = 40,
  className,
}: {
  markSize?: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-white">HubFlow</span>
        <StatusDot />
      </span>
    </div>
  )
}

// Plain SVG mark — no square, no ring, no background. Consumers pass `size`
// in pixels; padding around the glyph is baked into the SVG itself.
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/hubflow_a.svg"
      alt="HubFlow"
      width={size}
      height={size}
      className={cn("shrink-0 select-none", className)}
      priority
    />
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
