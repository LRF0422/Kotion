import React, { useEffect, useRef, useState } from "react";

/**
 * Reveal wraps children with a "fade+slide up on scroll into view" effect.
 * Uses IntersectionObserver so it's zero-cost when off-screen.
 */
export interface RevealProps {
    children: React.ReactNode;
    delay?: number;
    className?: string;
    as?: keyof JSX.IntrinsicElements;
}

export const Reveal: React.FC<RevealProps> = ({ children, delay = 0, className = "", as = "div" }) => {
    const ref = useRef<HTMLElement | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        // Respect reduced motion
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setVisible(true);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setVisible(true);
                        io.unobserve(entry.target);
                    }
                }
            },
            { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
        );
        io.observe(node);
        return () => io.disconnect();
    }, []);

    const Tag = as as React.ElementType;
    return (
        <Tag
            ref={ref as never}
            className={`reveal ${visible ? "is-visible" : ""} ${className}`}
            style={delay ? { transitionDelay: `${delay}ms` } : undefined}
        >
            {children}
        </Tag>
    );
};
