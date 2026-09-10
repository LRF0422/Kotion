package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolGateway;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SavedSkillServiceTest {

    @Test
    void repeatedTrustedSourceReturnsExistingSkillWithoutAnotherCompile() {
        Fixture fixture = new Fixture();
        fixture.prepareOwnedRootRun();
        SavedSkill existing = fixture.skill("skill-existing", "fp-1");
        when(fixture.intentPolicy.isExplicit(fixture.checkpoint.getMessages())).thenReturn(true);
        when(fixture.projector.projectForTool(fixture.checkpoint))
                .thenReturn(new ConversationTranscriptProjector.Projection("safe transcript", "fp-1"));
        when(fixture.store.findByFingerprint(8L, 7L, "fp-1")).thenReturn(existing);

        SavedSkillStore.SaveResult result = fixture.service.saveFromTool(fixture.context());

        assertFalse(result.isCreated());
        assertEquals("skill-existing", result.getSkill().getSkillId());
        verify(fixture.compiler, never()).compile(any(), any(), any());
        verify(fixture.store, never()).saveIfAbsent(any(), eq(100));
    }

    @Test
    void compilesAllowedToolsAndPersistsOwnerScopedDefinition() {
        Fixture fixture = new Fixture();
        fixture.prepareOwnedRootRun();
        fixture.checkpoint.getClientTools().add(ToolSpec.of(
                "editor.read", "read", Collections.emptyMap(), ToolKind.FRONTEND, true, "client"));
        when(fixture.toolGateway.backendSpecs()).thenReturn(Collections.singletonList(ToolSpec.of(
                "wiki.search", "search", Collections.emptyMap(), ToolKind.BACKEND, true, "skill")));
        when(fixture.intentPolicy.isExplicit(fixture.checkpoint.getMessages())).thenReturn(true);
        when(fixture.projector.projectForTool(fixture.checkpoint))
                .thenReturn(new ConversationTranscriptProjector.Projection("safe transcript", "fp-new"));

        SavedSkillDraft draft = new SavedSkillDraft();
        draft.setName("Research workflow");
        draft.setDescription("Research and summarize");
        draft.setTriggerText("research a topic");
        draft.setExampleIntents(Collections.singletonList("Find sources and summarize"));
        draft.setTags(Collections.singletonList("research"));
        draft.setSystemPromptFragment("Search, verify, and summarize.");
        draft.setRequiredToolNames(Collections.singletonList("wiki.search"));
        draft.setOptionalToolNames(Collections.singletonList("editor.read"));
        when(fixture.compiler.compile(eq("deepseek-chat"), eq("safe transcript"), any()))
                .thenReturn(draft);
        when(fixture.store.saveIfAbsent(any(SavedSkill.class), eq(100))).thenAnswer(invocation -> {
            SavedSkill saved = invocation.getArgument(0);
            saved.setSkillId("skill-new");
            return new SavedSkillStore.SaveResult(saved, true);
        });

        SavedSkillStore.SaveResult result = fixture.service.saveFromTool(fixture.context());

        assertEquals("skill-new", result.getSkill().getSkillId());
        ArgumentCaptor<SavedSkill> captor = ArgumentCaptor.forClass(SavedSkill.class);
        verify(fixture.store).saveIfAbsent(captor.capture(), eq(100));
        SavedSkill saved = captor.getValue();
        assertEquals(8L, saved.getTenantId());
        assertEquals(7L, saved.getUserId());
        assertEquals("conv-1", saved.getSourceConversationId());
        assertEquals("run-1", saved.getSourceRunId());
        assertEquals("fp-new", saved.getSourceFingerprint());
        assertEquals(Arrays.asList("wiki.search"), saved.getRequiredToolNames());
    }

    @Test
    void completedRunFallbackRequiresCompletedOwnedRootRun() {
        Fixture fixture = new Fixture();
        fixture.prepareOwnedRootRun();
        fixture.run.setStatus(RunStatus.RUNNING.name());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> fixture.service.saveCompletedRun("run-1", 8L, 7L));

        assertEquals("SAVED_SKILL_COMPLETED_RUN_REQUIRED", error.getMessage());
        verify(fixture.checkpointStore, never()).load(any());
    }

    @Test
    void rejectsMissingIdentityAndChildRunsBeforeCompilation() {
        Fixture fixture = new Fixture();
        ToolContext missingIdentity = fixture.context();
        missingIdentity.setTenantId(null);
        assertEquals("SAVED_SKILL_IDENTITY_REQUIRED",
                assertThrows(IllegalArgumentException.class,
                        () -> fixture.service.saveFromTool(missingIdentity)).getMessage());

        ToolContext child = fixture.context();
        child.setDelegateDepth(1);
        assertEquals("SAVED_SKILL_ROOT_RUN_REQUIRED",
                assertThrows(IllegalArgumentException.class,
                        () -> fixture.service.saveFromTool(child)).getMessage());
        verify(fixture.runStore, never()).load(any());
    }

    private static final class Fixture {
        private final SavedSkillStore store = mock(SavedSkillStore.class);
        private final RunStore runStore = mock(RunStore.class);
        private final CheckpointStore checkpointStore = mock(CheckpointStore.class);
        private final ExplicitSkillSaveIntentPolicy intentPolicy = mock(ExplicitSkillSaveIntentPolicy.class);
        private final ConversationTranscriptProjector projector = mock(ConversationTranscriptProjector.class);
        private final SavedSkillCompiler compiler = mock(SavedSkillCompiler.class);
        private final ToolGateway toolGateway = mock(ToolGateway.class);
        private final AgentCoreProperties properties = new AgentCoreProperties();
        private final SavedSkillService service = new SavedSkillService(
                store, runStore, checkpointStore, intentPolicy, projector, compiler, toolGateway, properties);
        private final Checkpoint checkpoint = new Checkpoint();
        private AgentRun run;

        private void prepareOwnedRootRun() {
            run = AgentRun.create("run-1", "conv-1", 7L, 8L,
                    "deepseek-chat", "execute", 1L);
            checkpoint.setRunId("run-1");
            checkpoint.getMessages().add(ChatMessage.builder()
                    .role("user").content("把这个会话保存成 skill").build());
            when(runStore.load("run-1")).thenReturn(run);
            when(checkpointStore.load("run-1")).thenReturn(checkpoint);
            when(toolGateway.backendSpecs()).thenReturn(Collections.emptyList());
        }

        private ToolContext context() {
            ToolContext context = new ToolContext();
            context.setRunId("run-1");
            context.setConversationId("conv-1");
            context.setModel("deepseek-chat");
            context.setTenantId(8L);
            context.setUserId(7L);
            return context;
        }

        private SavedSkill skill(String skillId, String fingerprint) {
            SavedSkill skill = new SavedSkill();
            skill.setSkillId(skillId);
            skill.setTenantId(8L);
            skill.setUserId(7L);
            skill.setSourceFingerprint(fingerprint);
            return skill;
        }
    }
}
