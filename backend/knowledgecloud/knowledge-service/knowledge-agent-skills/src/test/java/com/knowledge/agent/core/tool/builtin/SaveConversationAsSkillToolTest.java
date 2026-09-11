package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.savedskill.SavedSkill;
import com.knowledge.agent.core.savedskill.SavedSkillService;
import com.knowledge.agent.core.savedskill.SavedSkillStore;
import com.knowledge.agent.core.tool.ToolContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.Collections;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SaveConversationAsSkillToolTest {

    @Test
    @SuppressWarnings("unchecked")
    void exposesNoModelControlledContextArguments() {
        SavedSkillService service = mock(SavedSkillService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<SavedSkillService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(service);
        SaveConversationAsSkillTool tool = new SaveConversationAsSkillTool(provider);

        Map<String, Object> schema = tool.spec().getInputSchema();
        assertEquals("save_conversation_as_skill", tool.spec().getName());
        assertFalse(tool.spec().isReadOnly());
        assertEquals(Collections.emptyMap(), schema.get("properties"));
        assertEquals(false, schema.get("additionalProperties"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void delegatesWithTrustedToolContextAndReturnsSanitizedMetadata() {
        SavedSkillService service = mock(SavedSkillService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<SavedSkillService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(service);
        SaveConversationAsSkillTool tool = new SaveConversationAsSkillTool(provider);
        ToolContext context = new ToolContext();
        context.setRunId("run-1");
        context.setUserId(7L);
        context.setTenantId(8L);
        SavedSkill skill = new SavedSkill();
        skill.setSkillId("skill-1");
        skill.setName("Reusable workflow");
        skill.setVersion(1);
        when(service.saveFromTool(same(context)))
                .thenReturn(new SavedSkillStore.SaveResult(skill, true));

        Object raw = tool.execute(Collections.singletonMap("transcript", "untrusted"), context);

        Map<String, Object> result = (Map<String, Object>) raw;
        assertEquals("skill-1", result.get("skillId"));
        assertEquals("Reusable workflow", result.get("name"));
        assertEquals(1, result.get("version"));
        assertTrue((Boolean) result.get("created"));
        assertFalse((Boolean) result.get("updated"));
        assertFalse(result.containsKey("transcript"));
        verify(service).saveFromTool(same(context));
    }
}
