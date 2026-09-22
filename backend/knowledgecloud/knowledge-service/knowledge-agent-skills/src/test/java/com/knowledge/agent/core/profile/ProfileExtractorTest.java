package com.knowledge.agent.core.profile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Compliance gate: impossible to persist a sensitive attribute. The LLM is
 * faked out entirely — {@link ProfileExtractor#parseAndFilter(String)} is the
 * last line of defence and is exercised directly.
 */
class ProfileExtractorTest {

    private final ProfileExtractor extractor = new ProfileExtractor(
            null, new AgentCoreProperties(), new ObjectMapper());

    @Test
    void keepsEvidenceBackedAllowlistedDrafts() {
        List<ProfileTraitDraft> drafts = extractor.parseAndFilter(
                "{\"traits\":[{\"dimension\":\"occupation\",\"value\":\"后端工程师\","
                        + "\"confidence\":72,\"evidence\":\"我平时写 Java 后端\"}]}");

        assertEquals(1, drafts.size());
        assertEquals("occupation", drafts.get(0).getDimension());
        assertEquals(72, drafts.get(0).getConfidence());
    }

    @Test
    void dropsDraftsWithoutEvidence() {
        List<ProfileTraitDraft> drafts = extractor.parseAndFilter(
                "{\"traits\":[{\"dimension\":\"occupation\",\"value\":\"后端工程师\",\"confidence\":72}]}");
        assertTrue(drafts.isEmpty());
    }

    @Test
    void dropsNonAllowlistedDimension() {
        List<ProfileTraitDraft> drafts = extractor.parseAndFilter(
                "{\"traits\":[{\"dimension\":\"gender\",\"value\":\"女\",\"confidence\":99,"
                        + "\"evidence\":\"我是女生\"}]}");
        assertTrue(drafts.isEmpty());
    }

    @Test
    void complianceGateRejectsSensitiveConversation() {
        // The exact fixture the design spec demands: gender / depression /
        // introversion must produce ZERO storable traits.
        String response = "{\"traits\":["
                + "{\"dimension\":\"occupation\",\"value\":\"女性\",\"confidence\":90,"
                + "\"evidence\":\"我是女生\"},"
                + "{\"dimension\":\"content_topic\",\"value\":\"我最近抑郁\",\"confidence\":80,"
                + "\"evidence\":\"我最近很抑郁\"},"
                + "{\"dimension\":\"interaction_pref\",\"value\":\"性格内向\",\"confidence\":85,"
                + "\"evidence\":\"我性格内向\"}]}";
        List<ProfileTraitDraft> drafts = extractor.parseAndFilter(response);
        assertTrue(drafts.isEmpty(), "sensitive attributes must never survive the gate");
    }

    @Test
    void toleratesAMarkdownCodeFence() {
        String fenced = "~~~json\n"
                + "{\"traits\":[{\"dimension\":\"tech_stack\",\"value\":\"React\","
                + "\"confidence\":50,\"evidence\":\"我在用 React\"}]}\n~~~";
        List<ProfileTraitDraft> drafts = extractor.parseAndFilter(fenced);
        assertEquals(1, drafts.size());
        assertEquals("React", drafts.get(0).getValue());
    }

    @Test
    void malformedJsonYieldsNoDrafts() {
        assertTrue(extractor.parseAndFilter("not json at all").isEmpty());
    }
}
