import React from "react";
import { Hero } from "./sections/Hero";
import { StackCloud } from "./sections/StackCloud";
import { CapabilityBento } from "./sections/CapabilityBento";
import { Workflows } from "./sections/Workflows";
import { EcosystemSpotlight } from "./sections/EcosystemSpotlight";
import { EverywhereYouWork } from "./sections/EverywhereYouWork";
import { TemplatesPreview } from "./sections/TemplatesPreview";
import { OpenSource } from "./sections/OpenSource";
import { FAQ } from "./sections/FAQ";
import { FinalCTA } from "./sections/FinalCTA";

/**
 * Kotion landing page — composed from independently maintainable section
 * modules. Order below defines the top-to-bottom narrative of the page.
 */
export const Home: React.FC = () => (
    <>
        <Hero />
        <StackCloud />
        <CapabilityBento />
        <Workflows />
        <EcosystemSpotlight />
        <EverywhereYouWork />
        <TemplatesPreview />
        <OpenSource />
        <FAQ />
        <FinalCTA />
    </>
);
