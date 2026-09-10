package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.tool.ToolGateway;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SavedSkillInjectorTest {

    private final SavedSkillStore store = mock(SavedSkillStore.class);
    private final SavedSkillRetriever retriever = mock(SavedSkillRetriever.class);
    private final ToolGateway toolGateway = mock(ToolGateway.class);
    private final AgentCoreProperties properties = new AgentCoreProperties();
    private final SavedSkillInjector injector = new SavedSkillInjector(
            store, retriever, toolGateway, new ExplicitSkillSaveIntentPolicy(), properties);

    @Test
    void prependsRetrievedFragmentAndFreezesProvenance() {
        CreateRunCommand command = command("请整理今天的会议纪要");
        command.getSkillFragments().add("request supplied skill");
        SavedSkill skill = skill();
        when(store.listEnabledCandidates(1L, 2L, 100)).thenReturn(Collections.singletonList(skill));
        when(toolGateway.backendSpecs()).thenReturn(Collections.emptyList());
        when(retriever.retrieve(anyList(), eq("请整理今天的会议纪要"), anySet(), anyDouble(), anyInt()))
                .thenReturn(Collections.singletonList(
                        new SavedSkillMatch(skill, 0.8, Collections.singletonList("editor.read"))));

        injector.inject(command);

        assertEquals(2, command.getSkillFragments().size());
        assertTrue(command.getSkillFragments().get(0).contains("meeting-skill"));
        assertEquals("request supplied skill", command.getSkillFragments().get(1));
        assertEquals(1, command.getSavedSkillProvenance().size());
        assertEquals("meeting-skill", command.getSavedSkillProvenance().get(0).getSkillId());
        verify(store).markUsed(eq(1L), eq(2L), eq("meeting-skill"), anyLong());
    }

    @Test
    void skipsRetrievalForExplicitSaveRequest() {
        CreateRunCommand command = command("请把当前会话保存为个人技能");

        injector.inject(command);

        verifyNoInteractions(store, retriever, toolGateway);
    }

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void noToolsPassesAnEmptyAvailableCatalog() {
        CreateRunCommand command = command("请整理今天的会议纪要");
        command.setNoTools(true);
        SavedSkill skill = skill();
        when(store.listEnabledCandidates(1L, 2L, 100)).thenReturn(Collections.singletonList(skill));
        when(retriever.retrieve(anyList(), eq("请整理今天的会议纪要"), anySet(), anyDouble(), anyInt()))
                .thenReturn(Collections.emptyList());

        injector.inject(command);

        ArgumentCaptor<Set> available = ArgumentCaptor.forClass(Set.class);
        verify(retriever).retrieve(anyList(), eq("请整理今天的会议纪要"),
                available.capture(), anyDouble(), anyInt());
        assertTrue(available.getValue().isEmpty());
        verify(toolGateway, never()).backendSpecs();
    }

    private CreateRunCommand command(String content) {
        CreateRunCommand command = new CreateRunCommand();
        command.setTenantId(1L);
        command.setUserId(2L);
        command.getMessages().add(ChatMessage.builder().role("user").content(content).build());
        return command;
    }

    private SavedSkill skill() {
        SavedSkill skill = new SavedSkill();
        skill.setSkillId("meeting-skill");
        skill.setName("会议纪要");
        skill.setVersion(1);
        skill.setSourceFingerprint("fingerprint");
        skill.setSystemPromptFragment("读取会议内容并整理行动项");
        skill.setEnabled(true);
        return skill;
    }
}
