package com.knowledge.wiki.service.entity.dto;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import javax.validation.Validation;
import javax.validation.Validator;

import org.junit.jupiter.api.Test;

class PageDTOValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void pageTypeAccepts191CharactersAndRejectsLongerValues() {
        PageDTO dto = validPage();
        dto.setPageType(repeat('a', 191));
        assertTrue(validator.validate(dto).isEmpty());

        dto.setPageType(repeat('a', 192));
        assertFalse(validator.validate(dto).isEmpty());
    }

    private PageDTO validPage() {
        PageDTO dto = new PageDTO();
        dto.setSpaceId(10L);
        dto.setTitle("Page");
        return dto;
    }

    private String repeat(char value, int count) {
        StringBuilder result = new StringBuilder(count);
        for (int i = 0; i < count; i++) {
            result.append(value);
        }
        return result.toString();
    }

}
