package com.knowledge.wiki.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Arrays;
import java.util.Collections;

import org.junit.jupiter.api.Test;

import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.wiki.service.entity.VersionDesc;

class PluginSubmissionValidatorTest {

    @Test
    void comparesSemanticVersionsNumerically() {
        assertEquals(1, PluginSubmissionValidator.compareSemanticVersions("1.10.0", "1.9.9"));
        assertEquals(-1, PluginSubmissionValidator.compareSemanticVersions("2.0.0", "10.0.0"));
        assertEquals("1.2.10", PluginSubmissionValidator.nextPatchVersion("1.2.9"));
        assertEquals("1.2.10000000000000000000000000000000000000000",
                PluginSubmissionValidator.nextPatchVersion("1.2.9999999999999999999999999999999999999999"));
    }

    @Test
    void rejectsNonStrictSemanticVersions() {
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireSemanticVersion("v1.0.0"));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireSemanticVersion("01.0.0"));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireSemanticVersion("1.0"));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireSemanticVersion("1.0."
                        + String.join("", Collections.nCopies(61, "9"))));
    }

    @Test
    void normalizesAndDeduplicatesTags() {
        assertEquals(Arrays.asList("drawing", "team"),
                PluginSubmissionValidator.normalizeTags(Arrays.asList(" Drawing ", "drawing", "TEAM")));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.normalizeTags(Collections.emptyList()));
    }

    @Test
    void acceptsOnlyCanonicalJavaScriptObjectPaths() {
        assertEquals("plugins/example/index.js",
                PluginSubmissionValidator.requireJavaScriptPath(" plugins/example/index.js "));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireJavaScriptPath("https://example.com/plugin.js"));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireJavaScriptPath("plugins/../plugin.js"));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireJavaScriptPath("plugins/plugin.css"));
    }

    @Test
    void validatesSriAndJsonVersionDescriptions() {
        String hash = "sha384-" + String.join("", Collections.nCopies(64, "A"));
        assertEquals(hash, PluginSubmissionValidator.requireIntegrity(hash));
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.requireIntegrity("sha256-abc"));

        VersionDesc valid = new VersionDesc();
        valid.setLabel("ChangeLog");
        valid.setContent("{\"type\":\"doc\"}");
        PluginSubmissionValidator.validateVersionDescriptions(Collections.singletonList(valid));

        VersionDesc invalid = new VersionDesc();
        invalid.setLabel("ChangeLog");
        invalid.setContent("not-json");
        assertThrows(BusinessException.class,
                () -> PluginSubmissionValidator.validateVersionDescriptions(Collections.singletonList(invalid)));
    }
}
