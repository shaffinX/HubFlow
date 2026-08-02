import Image from "next/image"

import { cn } from "@/lib/utils"

// Full HubFlow wordmark. We crop the shared SVG to just its content box so the
// lockup lines up flush regardless of the parent's alignment.
const HUBFLOW_LOCKUP_VIEWBOX = 1024
const HUBFLOW_LOCKUP_CONTENT = { minX: 44.6, minY: 354.2, width: 948.9, height: 315.5 }

export function BrandLockup({
  height = 32,
  className,
}: {
  height?: number
  className?: string
}) {
  const scale = height / HUBFLOW_LOCKUP_CONTENT.height
  const width = Math.round(HUBFLOW_LOCKUP_CONTENT.width * scale)
  const imgSize = Math.round(HUBFLOW_LOCKUP_VIEWBOX * scale)
  const left = -Math.round(HUBFLOW_LOCKUP_CONTENT.minX * scale)
  const top = -Math.round(HUBFLOW_LOCKUP_CONTENT.minY * scale)

  return (
    <div className={cn("relative shrink-0 overflow-hidden", className)} style={{ width, height }}>
      <Image
        src="/hubflow.svg"
        alt="HubFlow"
        width={imgSize}
        height={imgSize}
        style={{ position: "absolute", left, top, maxWidth: "none" }}
        preload
      />
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
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
    </span>
  )
}
