import * as React from "react"

import { cn } from "@ui/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    return (
      <div className=" relative">
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
            "peer pe-9"
          )}
          ref={ref}
          {...props}
        />
        {
          icon && <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center justify-center pe-3 text-muted-foreground/80 peer-disabled:opacity-50">
            {icon}
          </div>
        }
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
