package com.knowledge.agent.core.savedskill;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** JSON codec for the controlled string-array columns in saved-skill rows. */
@Component
public class SavedSkillJsonCodec {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<List<String>>() { };

    private final ObjectMapper objectMapper;

    public SavedSkillJsonCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String writeStrings(Collection<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? new ArrayList<String>() : values);
        } catch (Exception e) {
            throw new IllegalStateException("Saved skill list serialization failed", e);
        }
    }

    public List<String> readStrings(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<String> values = objectMapper.readValue(json, STRING_LIST);
            return values != null ? new ArrayList<>(values) : new ArrayList<String>();
        } catch (Exception e) {
            throw new IllegalStateException("Saved skill list deserialization failed", e);
        }
    }
}
