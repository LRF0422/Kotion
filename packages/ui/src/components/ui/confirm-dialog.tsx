import * as React from "react"

import { cn } from "@ui/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog"

export interface ConfirmDialogProps {
  open: boolean
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel: React.ReactNode
  variant?: "default" | "destructive"
  confirmDisabled?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "default",
  confirmDisabled = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) => {
  const handleConfirm = () => {
    onOpenChange(false)
    onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="h-11 sm:h-10">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              "h-11 sm:h-10",
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
