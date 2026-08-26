package com.knowledge.wiki.service.entity.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import java.util.Set;

import javax.validation.ConstraintViolation;
import javax.validation.Validation;
import javax.validation.Validator;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.enums.PluginCategory;

class PluginSubmissionDTOValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsApprovedSubmissionShape() {
        PluginSubmissionDTO dto = validSubmission();
        assertTrue(validator.validate(dto).isEmpty());
    }

    @Test
    void rejectsInvalidKeyVersionTagsAndIntegrity() {
        PluginSubmissionDTO dto = validSubmission();
        dto.setPluginKey("Bad_Key");
        dto.setVersion("1.0");
        dto.setTags(Collections.emptyList());
        dto.setIntegrity("sha256-short");

        Set<ConstraintViolation<PluginSubmissionDTO>> violations = validator.validate(dto);
        assertFalse(violations.isEmpty());
        assertEquals(4, violations.stream().map(v -> v.getPropertyPath().toString()).distinct().count());
    }

    private PluginSubmissionDTO validSubmission() {
        PluginSubmissionDTO dto = new PluginSubmissionDTO();
        dto.setName("Example Plugin");
        dto.setPluginKey("example-plugin");
        dto.setVersion("1.0.0");
        dto.setCategory(PluginCategory.FEATURE);
        dto.setTags(Collections.singletonList("drawing"));
        dto.setIcon("plugins/example/icon.png");
        dto.setDescription("A sufficiently descriptive plugin summary.");
        dto.setResourcePath("plugins/example/index.js");
        dto.setIntegrity("sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        VersionDesc desc = new VersionDesc();
        desc.setLabel("ChangeLog");
        desc.setContent("{\"type\":\"doc\"}");
        dto.setVersionDescs(Collections.singletonList(desc));
        return dto;
    }
}
