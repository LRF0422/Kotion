package com.knowledge.agent.core.savedskill;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SavedSkillJsonCodecTest {

    private final SavedSkillJsonCodec codec = new SavedSkillJsonCodec(new ObjectMapper());

    @Test
    void roundTripsControlledStringLists() {
        assertEquals(Arrays.asList("editor.read", "wiki.search"),
                codec.readStrings(codec.writeStrings(Arrays.asList("editor.read", "wiki.search"))));
        assertEquals(Collections.emptyList(), codec.readStrings(codec.writeStrings(null)));
        assertEquals(Collections.emptyList(), codec.readStrings(null));
    }

    @Test
    void rejectsMalformedStoredJson() {
        assertThrows(IllegalStateException.class, () -> codec.readStrings("{not-json}"));
    }
}
