package com.knowledge.agent.core.profile;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileSensitivityTest {

    @Test
    void blocksGenderMentalStateAndPersonality() {
        assertTrue(ProfileSensitivity.isBlocked("女性"));
        assertTrue(ProfileSensitivity.isBlocked("我最近很抑郁"));
        assertTrue(ProfileSensitivity.isBlocked("性格内向"));
        assertTrue(ProfileSensitivity.isBlocked("female"));
        assertTrue(ProfileSensitivity.isBlocked("MBTI INTJ"));
    }

    @Test
    void allowsOrdinaryLowSensitivityValues() {
        assertFalse(ProfileSensitivity.isBlocked("后端工程师"));
        assertFalse(ProfileSensitivity.isBlocked("分布式系统"));
        assertFalse(ProfileSensitivity.isBlocked("Java"));
        assertFalse(ProfileSensitivity.isBlocked("长文"));
    }

    @Test
    void storableRequiresAllowlistedDimensionAndCleanText() {
        assertTrue(ProfileSensitivity.isStorable("occupation", "后端工程师", "我在做后端"));
        assertFalse(ProfileSensitivity.isStorable("gender", "女", "我是女生"));
        assertFalse(ProfileSensitivity.isStorable("occupation", "后端工程师", "我是女生"));
    }
}
