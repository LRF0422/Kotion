package com.knowledge.agent.core.savedskill;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KeywordSavedSkillRetrieverTest {

    private final KeywordSavedSkillRetriever retriever = new KeywordSavedSkillRetriever();

    @Test
    void ranksCjkIntentAndAppliesToolCompatibility() {
        SavedSkill meeting = skill("a", "会议纪要整理", "整理会议纪要和行动项");
        meeting.setExampleIntents(Collections.singletonList("把今天的讨论整理成会议纪要"));
        meeting.setTags(Arrays.asList("会议", "行动项"));
        meeting.setRequiredToolNames(Collections.singletonList("editor.read"));
        meeting.setOptionalToolNames(Collections.singletonList("editor.insert"));
        SavedSkill unrelated = skill("b", "代码审查", "检查代码缺陷");

        List<SavedSkillMatch> matches = retriever.retrieve(Arrays.asList(unrelated, meeting),
                "请把今天讨论整理成会议纪要并列出行动项",
                new LinkedHashSet<>(Collections.singletonList("editor.read")), 0.20, 3);

        assertEquals(1, matches.size());
        assertEquals("a", matches.get(0).getSkill().getSkillId());
        assertTrue(matches.get(0).getCompatibleToolNames().contains("editor.read"));
        assertFalse(matches.get(0).getCompatibleToolNames().contains("editor.insert"));
    }

    @Test
    void excludesMissingRequiredToolsAndHonorsLimit() {
        SavedSkill first = skill("a", "Incident summary", "summarize API incident");
        first.setRequiredToolNames(Collections.singletonList("web_fetch"));
        SavedSkill second = skill("b", "Incident notes", "summarize API incident notes");

        List<SavedSkillMatch> withoutTool = retriever.retrieve(Arrays.asList(first, second),
                "summarize the API incident", Collections.emptySet(), 0.10, 1);

        assertEquals(1, withoutTool.size());
        assertEquals("b", withoutTool.get(0).getSkill().getSkillId());
    }

    @Test
    void usesStableSkillIdTieBreak() {
        SavedSkill laterId = skill("b", "same", "same workflow");
        SavedSkill earlierId = skill("a", "same", "same workflow");

        List<SavedSkillMatch> matches = retriever.retrieve(Arrays.asList(laterId, earlierId),
                "same workflow", Collections.emptySet(), 0.0, 2);

        assertEquals("a", matches.get(0).getSkill().getSkillId());
        assertEquals("b", matches.get(1).getSkill().getSkillId());
    }

    private SavedSkill skill(String id, String name, String trigger) {
        SavedSkill skill = new SavedSkill();
        skill.setSkillId(id);
        skill.setName(name);
        skill.setDescription(name);
        skill.setTriggerText(trigger);
        skill.setSystemPromptFragment("procedure");
        skill.setEnabled(true);
        skill.setVersion(1);
        skill.setUpdateTime(100L);
        return skill;
    }
}
