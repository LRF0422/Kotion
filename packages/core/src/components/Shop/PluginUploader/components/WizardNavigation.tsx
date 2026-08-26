import { Progress, cn, useResponsive } from "@kn/ui";
import { CheckIcon } from "@kn/icon";
import React from "react";

export interface WizardStep {
  number: number;
  label: string;
  description: string;
}

interface WizardNavigationProps {
  steps: WizardStep[];
  currentStep: number;
  highestStep: number;
  onStepClick: (step: number) => void;
  stepLabel: string;
}

export const WizardNavigation = ({
  steps,
  currentStep,
  highestStep,
  onStepClick,
  stepLabel,
}: WizardNavigationProps) => {
  const { isMobile } = useResponsive();

  if (isMobile) {
    const active = steps[currentStep - 1];
    return (
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {stepLabel} {currentStep}/{steps.length}
          </span>
          <span className="truncate font-medium text-foreground">
            {active.label}
          </span>
        </div>
        <Progress
          value={(currentStep / steps.length) * 100}
          className="h-1.5"
        />
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {active.description}
        </p>
      </div>
    );
  }

  return (
    <nav
      className="flex h-full w-[220px] shrink-0 flex-col border-r bg-muted/20 p-4"
      aria-label={stepLabel}
    >
      <div className="space-y-2">
        {steps.map((step) => {
          const active = step.number === currentStep;
          const complete = step.number < currentStep;
          const enabled = step.number <= highestStep;
          return (
            <button
              key={step.number}
              type="button"
              disabled={!enabled}
              aria-current={active ? "step" : undefined}
              onClick={() => enabled && onStepClick(step.number)}
              className={cn(
                "flex min-h-14 w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-background shadow-sm ring-1 ring-border",
                !active && enabled && "hover:bg-background/70",
                !enabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  active && "border-primary bg-primary text-primary-foreground",
                  complete && "border-green-600 bg-green-600 text-white",
                )}
              >
                {complete ? <CheckIcon className="size-3.5" /> : step.number}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {step.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto rounded-lg border bg-background/70 p-3 text-xs leading-5 text-muted-foreground">
        {stepLabel} {currentStep}/{steps.length}
      </div>
    </nav>
  );
};
