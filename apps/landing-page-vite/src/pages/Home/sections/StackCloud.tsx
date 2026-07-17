import React from "react";
import { useTranslation } from "@kn/common";

const STACK = ["Tiptap", "Hocuspocus", "React", "Turborepo", "shadcn/ui", "Vite"];

/**
 * StackCloud: instead of fake customer logos we show the real tech stack.
 * Uses text wordmarks so no image dependency is required.
 */
export const StackCloud: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section className="border-t border-b py-14" style={{ borderColor: "var(--kn-line)" }}>
            <div className="container-padding">
                <p
                    className="text-center text-xs uppercase tracking-[0.2em] mb-8"
                    style={{ color: "var(--kn-ink-soft)" }}
                >
                    {t("home.stack-built-with")}
                </p>
                <div className="logo-cloud">
                    {STACK.map((name) => (
                        <span
                            key={name}
                            className="text-xl md:text-2xl font-semibold tracking-tight"
                            style={{ color: "var(--kn-ink-soft)" }}
                        >
                            {name}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
};
