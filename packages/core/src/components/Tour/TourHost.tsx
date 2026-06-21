import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    AppContext,
    event,
    PLUGIN_INIT_SUCCESS,
    START_TOUR,
    useNavigator,
    useTourRegistry,
    type TourConfig,
    type TourStepConfig,
} from "@kn/common";
import { Onboarding, OnboardingStep, useIsMobile } from "@kn/ui";
import { BUILTIN_TOURS } from "./builtin-tours";

const RUNTIME_ATTR = "data-kn-tour-target";

/** Convert a TourStepConfig to the UI runner's OnboardingStep. */
function toOnboardingStep(tour: TourConfig, step: TourStepConfig): OnboardingStep {
    const selector =
        typeof step.target === "string"
            ? step.target
            : `[${RUNTIME_ATTR}="${tour.id}.${step.id}"]`;
    return {
        id: step.id,
        targetSelector: selector,
        title: step.title,
        description: step.description,
        placement: step.placement,
        actionText: step.actionText,
        allowInteraction: step.allowInteraction,
        spotlightPadding: step.spotlightPadding,
    };
}

/**
 * TourHost — mounts the tour runner, registers core + plugin tours, auto-starts
 * the first uncompleted auto tour, and handles imperative START_TOUR events.
 */
export const TourHost: React.FC = () => {
    const { registry, loading, tours } = useTourRegistry();
    const { pluginManager } = useContext(AppContext);
    const navigator = useNavigator();
    const isMobile = useIsMobile();

    const [activeTour, setActiveTour] = useState<TourConfig | null>(null);
    const [steps, setSteps] = useState<OnboardingStep[]>([]);

    // Refs for callbacks that must read the latest active tour / its steps.
    const activeTourRef = useRef<TourConfig | null>(null);
    const activeStepsRef = useRef<TourStepConfig[]>([]);
    const completedRef = useRef(false);
    // Auto tours already attempted this session — prevents re-looping and lets
    // multiple auto tours play in sequence (welcome → home → ...).
    const autoStartedIdsRef = useRef<Set<string>>(new Set());

    activeTourRef.current = activeTour;

    // Register core + plugin tours (re-run when plugins change).
    useEffect(() => {
        const registerAll = () => {
            const pluginTours = pluginManager?.resolveTours() ?? [];
            registry.register([...BUILTIN_TOURS, ...pluginTours]);
        };
        registerAll();
        event.on(PLUGIN_INIT_SUCCESS, registerAll);
        return () => {
            event.off(PLUGIN_INIT_SUCCESS, registerAll);
        };
    }, [registry, pluginManager]);

    const startTour = useCallback((tourId: string) => {
        const tour = registry.getTour(tourId);
        if (!tour || !tour.steps.length) return;

        // Resume: drop steps already completed; if all done, start from scratch.
        const done = new Set(registry.getCompletedSteps(tourId));
        let remaining = tour.steps.filter((s) => !done.has(s.id));
        if (remaining.length === 0) remaining = tour.steps;

        completedRef.current = false;
        activeStepsRef.current = remaining;
        setSteps(remaining.map((s) => toOnboardingStep(tour, s)));
        setActiveTour(tour);
    }, [registry]);

    // Auto-start uncompleted auto tours in priority order (desktop only). Runs
    // again whenever the active tour clears, so tours play back-to-back; each id
    // is attempted at most once per session to avoid loops.
    useEffect(() => {
        if (loading || isMobile || activeTour) return;
        const next = registry.getNextAutoTour();
        if (next && !autoStartedIdsRef.current.has(next.id)) {
            autoStartedIdsRef.current.add(next.id);
            startTour(next.id);
        }
    }, [loading, isMobile, activeTour, tours, registry, startTour]);

    // Imperative start via event.
    useEffect(() => {
        const handler = (tourId: string) => startTour(tourId);
        event.on(START_TOUR, handler);
        return () => {
            event.off(START_TOUR, handler);
        };
    }, [startTour]);

    // Prepare the step being entered: route nav, dynamic-target tagging, beforeStep.
    const handleStepChange = useCallback((_step: OnboardingStep, index: number) => {
        const tour = activeTourRef.current;
        const original = activeStepsRef.current[index];
        if (!tour || !original) return;

        if (original.route) {
            navigator.go({ to: original.route });
        }
        if (typeof original.target === "function") {
            const el = original.target();
            el?.setAttribute(RUNTIME_ATTR, `${tour.id}.${original.id}`);
        }
        Promise.resolve(original.beforeStep?.()).catch(() => { });

        // Mark as reached for resume support.
        registry.markStepDone(tour.id, original.id);
    }, [navigator, registry]);

    const handleComplete = useCallback(() => {
        completedRef.current = true;
        if (activeTourRef.current) registry.complete(activeTourRef.current.id);
    }, [registry]);

    const handleClose = useCallback(() => {
        const tour = activeTourRef.current;
        if (tour && !completedRef.current) {
            registry.dismiss(tour.id);
        }
        completedRef.current = false;
        setActiveTour(null);
        setSteps([]);
    }, [registry]);

    if (!activeTour || steps.length === 0) return null;

    return (
        <Onboarding
            steps={steps}
            isOpen={!!activeTour}
            onClose={handleClose}
            onComplete={handleComplete}
            onStepChange={handleStepChange}
        />
    );
};
