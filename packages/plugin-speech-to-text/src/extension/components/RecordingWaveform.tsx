import React, { useEffect, useRef } from "react";
import { cn } from "@kn/ui";

const BAR_COUNT = 18;

interface RecordingWaveformProps {
    active: boolean;
    className?: string;
}

const staticScale = (index: number) => {
    const center = 1 - Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
    return Math.min(0.88, 0.18 + center * 0.52 + (index % 3) * 0.05);
};

export const RecordingWaveform: React.FC<RecordingWaveformProps> = ({ active, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const bars = containerRef.current?.querySelectorAll<HTMLDivElement>(".recording-waveform-bar");
        if (!bars) return;

        const stop = () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        const settle = () => {
            bars.forEach((bar, index) => {
                const scale = active ? staticScale(index) : 0.16 + (index % 2) * 0.05;
                bar.style.transform = `scaleY(${scale.toFixed(3)})`;
            });
        };
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const tick = () => {
            bars.forEach((bar, index) => {
                const center = 1 - Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
                const scale = 0.16 + Math.random() * (0.3 + center * 0.48);
                bar.style.transform = `scaleY(${scale.toFixed(3)})`;
            });
            rafRef.current = requestAnimationFrame(tick);
        };
        const syncMotion = () => {
            stop();
            if (active && !motionQuery.matches) rafRef.current = requestAnimationFrame(tick);
            else settle();
        };

        motionQuery.addEventListener("change", syncMotion);
        syncMotion();
        return () => {
            stop();
            motionQuery.removeEventListener("change", syncMotion);
        };
    }, [active]);

    return (
        <div
            ref={containerRef}
            aria-hidden="true"
            className={cn("flex h-5 min-w-20 flex-1 items-center justify-center gap-[3px]", className)}
        >
            {Array.from({ length: BAR_COUNT }).map((_, index) => (
                <span
                    key={index}
                    className={cn(
                        "recording-waveform-bar h-full w-[2px] origin-center rounded-full transition-transform duration-100 ease-out",
                        active ? "bg-foreground/55" : "bg-muted-foreground/25",
                    )}
                    style={{ transform: "scaleY(0.16)" }}
                />
            ))}
        </div>
    );
};
