package com.knowledge.agent.core.savedskill;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExplicitSkillSaveIntentPolicyTest {

    private final ExplicitSkillSaveIntentPolicy policy = new ExplicitSkillSaveIntentPolicy();

    @Test
    void acceptsExplicitChineseAndEnglishRequests() {
        assertTrue(policy.isExplicitMessage("请把当前会话提炼成个人技能并保存"));
        assertTrue(policy.isExplicitMessage("Save this conversation as a reusable skill."));
    }

    @Test
    void rejectsNegatedRequests() {
        assertFalse(policy.isExplicitMessage("不要把这段对话保存为技能"));
        assertFalse(policy.isExplicitMessage("Do not save this as a skill."));
    }

    @Test
    void rejectsCapabilityQuestionsWithoutSaveConsent() {
        assertFalse(policy.isExplicitMessage("Can you save skills?"));
        assertFalse(policy.isExplicitMessage("你能保存技能吗？"));
        assertFalse(policy.isExplicitMessage("How do I create a skill?"));
    }
}
