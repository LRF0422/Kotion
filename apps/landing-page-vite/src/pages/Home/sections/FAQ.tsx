import React, { useEffect, useState } from "react";
import { useTranslation } from "@kn/common";
import { ChevronDown } from "@kn/icon";
import { Reveal } from "../../../components/Reveal";
import { SectionHeading } from "../../../components/SectionHeading";
import { injectJsonLd, removeJsonLd } from "../../../ops/seo";

const IDS = [1, 2, 3, 4, 5, 6] as const;

export const FAQ: React.FC = () => {
    const { t } = useTranslation();
    const [openId, setOpenId] = useState<number | null>(1);

    // 结构化数据：FAQPage（仅在本页实际渲染的问答非空时注入）
    useEffect(() => {
        const items = IDS.map((id) => ({
            question: t(`home.faq-q${id}`),
            answer: t(`home.faq-a${id}`),
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
        <section id="faq" className="section-padding" style={{ background: "var(--kn-paper)" }}>
            <div className="container-padding">
                <Reveal>
                    <SectionHeading
                        eyebrow={t("home.faq-eyebrow")}
                        title={t("home.faq-title")}
                        description={t("home.faq-desc")}
                        scene="ai"
                    />
                </Reveal>

                <div className="mt-14 max-w-3xl mx-auto space-y-3">
                    {IDS.map((id, i) => {
                        const isOpen = openId === id;
                        return (
                            <Reveal key={id} delay={i * 40}>
                                <div
                                    className="rounded-xl border transition-colors"
                                    style={{
                                        borderColor: isOpen ? "var(--scene-ai-500)" : "var(--kn-line)",
                                        background: "var(--kn-paper)",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(isOpen ? null : id)}
                                        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                                        aria-expanded={isOpen}
                                    >
                                        <span className="font-medium" style={{ color: "var(--kn-ink)" }}>
                                            {t(`home.faq-q${id}`)}
                                        </span>
                                        <ChevronDown
                                            className="w-4 h-4 flex-shrink-0 transition-transform"
                                            style={{
                                                color: isOpen ? "var(--scene-ai-600)" : "var(--kn-ink-soft)",
                                                transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                                            }}
                                        />
                                    </button>
                                    <div
                                        className="grid transition-[grid-template-rows] duration-300 ease-out"
                                        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                                    >
                                        <div className="overflow-hidden">
                                            <p
                                                className="px-5 pb-5 text-sm leading-relaxed"
                                                style={{ color: "var(--kn-ink-soft)" }}
                                            >
                                                {t(`home.faq-a${id}`)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
