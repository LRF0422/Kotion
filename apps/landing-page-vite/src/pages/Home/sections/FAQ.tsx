import React, { useEffect, useState } from "react";
import { useTranslation } from "@kn/common";
import { ChevronDown } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { injectJsonLd, removeJsonLd } from "../../../ops/seo";
import { readString, type SectionProps } from "../../../ops/section-props";

const IDS = [1, 2, 3, 4, 5, 6] as const;

export interface FAQSectionProps {
    props?: SectionProps;
}

export const FAQ: React.FC<FAQSectionProps> = ({ props: sectionProps }) => {
    const { t } = useTranslation();
    const [openId, setOpenId] = useState<number | null>(1);

    // 结构化数据：FAQPage（仅在本页实际渲染的问答非空时注入）
    useEffect(() => {
        const items = IDS.map((id) => ({
            question: t("home.faq-q" + id),
            answer: t("home.faq-a" + id),
        })).filter((item) => item.question !== "" && item.answer !== "");
        if (items.length === 0) return;
        injectJsonLd("home-faq", {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
        });
        return () => removeJsonLd("home-faq");
    }, [t]);

    return (
        <section id="faq" className="section-padding section-alt">
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        index="08"
                        eyebrow={readString(sectionProps, "eyebrow", t("home.faq-eyebrow"))}
                        title={readString(sectionProps, "title", t("home.faq-title"))}
                        description={readString(sectionProps, "desc", t("home.faq-desc"))}
                    />
                </Reveal>

                <div className="mx-auto mt-14 max-w-3xl border-t" style={{ borderColor: "var(--kn-line)" }}>
                    {IDS.map((id) => {
                        const isOpen = openId === id;
                        return (
                            <div key={id} className="border-b" style={{ borderColor: "var(--kn-line)" }}>
                                <button
                                    type="button"
                                    onClick={() => setOpenId(isOpen ? null : id)}
                                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                                    aria-expanded={isOpen}
                                >
                                    <span className="text-[15px] font-medium" style={{ color: "var(--kn-ink)" }}>
                                        {t("home.faq-q" + id)}
                                    </span>
                                    <ChevronDown
                                        className="h-4 w-4 shrink-0 transition-transform"
                                        style={{
                                            color: isOpen ? "var(--kn-accent)" : "var(--kn-ink-mute)",
                                            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                        }}
                                    />
                                </button>
                                <div
                                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                                >
                                    <div className="overflow-hidden">
                                        <p className="max-w-2xl pb-5 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                            {t("home.faq-a" + id)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
