package com.knowledge.agent.core.profile;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileDimensionTest {

    @Test
    void allowlistsOnlyLowSensitivityDimensions() {
        assertTrue(ProfileDimension.isAllowlisted("occupation"));
        assertTrue(ProfileDimension.isAllowlisted("content_topic"));
        assertEquals(ProfileDimension.TECH_STACK, ProfileDimension.fromKey(" TECH_STACK "));
    }

    @Test
    void rejectsUnknownAndSensitiveDimensions() {
        assertFalse(ProfileDimension.isAllowlisted("gender"));
        assertFalse(ProfileDimension.isAllowlisted("mental_state"));
        assertFalse(ProfileDimension.isAllowlisted("personality"));
        assertFalse(ProfileDimension.isAllowlisted("health"));
        assertNull(ProfileDimension.fromKey("gender"));
    }

    @Test
    void stableDimensionsCarryLongerHalfLifeThanEphemeral() {
        assertTrue(ProfileDimension.OCCUPATION.getHalfLifeDays()
                > ProfileDimension.ACTIVE_HOURS.getHalfLifeDays());
        assertTrue(ProfileDimension.OCCUPATION.isMultiValue() == false);
        assertTrue(ProfileDimension.EXPERTISE.isMultiValue());
        assertNotNull(ProfileDimension.CONTENT_TOPIC.getLabel());
    }
}
