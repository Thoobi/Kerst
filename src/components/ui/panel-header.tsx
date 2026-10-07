import * as React from "react"

import { cn } from "@/lib/utils"

function PanelHeader({
  className,
  title,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title: string
  icon?: React.ReactNode
}) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex h-10 shrink-0 items-center justify-between gap-2 px-3.5",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2 truncate text-[0.8125rem] font-medium text-foreground [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </span>
      {children && (
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      )}
    </div>
  )
}

export { PanelHeader }
