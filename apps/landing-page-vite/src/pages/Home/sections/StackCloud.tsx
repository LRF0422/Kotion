import React from "react";
import { useTranslation } from "@kn/common";
import { readString, readStringArray, type SectionProps } from "../../../ops/section-props";

const DEFAULT_STACK = ["Tiptap", "Hocuspocus", "React", "Turborepo", "shadcn/ui", "Vite"];

export interface StackCloudSectionProps {
    props?: SectionProps;
}

/**
 * A thin "built with" strip instead of a logo cloud. The list is
 * ops-editable via SECTION props (heading, items).
 */
export const StackCloud: React.FC<StackCloudSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    const heading = readString(sectionProps, "heading", t("home.stack-built-with"));
    const items = readStringArray(sectionProps, "items", DEFAULT_STACK);

    return (
        <section className="border-y" style={{ borderColor: "var(--kn-line)" }}>
            <div className="container-padding py-9">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <span className="kicker shrink-0">{heading}</span>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {items.map((name, index) => (
                            <React.Fragment key={name}>
                                {index > 0 && <span className="hidden h-3 w-px sm:block" style={{ background: "var(--kn-line-strong)" }} />}
                                <span className="text-sm font-medium tracking-[-0.01em]" style={{ color: "var(--kn-ink-soft)" }}>
                                    {name}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
