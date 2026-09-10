package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.config.AgentCoreProperties;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConversationTranscriptProjectorTest {

    private final ExplicitSkillSaveIntentPolicy policy = new ExplicitSkillSaveIntentPolicy();
    private final ConversationTranscriptProjector projector = new ConversationTranscriptProjector(
            new AgentCoreProperties(), new SecretRedactor(), policy);

    @Test
    void projectsTrustedVisibleConversationAndRedactsSecrets() {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setToken("jwt-must-never-appear");
        checkpoint.getMessages().add(ChatMessage.builder()
                .role("system").content("hidden system prompt").build());
        checkpoint.getMessages().add(ChatMessage.builder()
                .role("user").content("读取数据，password=hunter2").build());
        ChatMessage assistant = ChatMessage.builder()
                .role("assistant").content("我会读取并整理").reasoningContent("private reasoning").build();
        assistant.setToolCalls(Arrays.asList(new ChatMessage.ToolCallInfo("call-1", "function",
                new ChatMessage.ToolCallInfo.FunctionInfo("editor.read", "{\"apiKey\":\"secret-key\"}"))));
        checkpoint.getMessages().add(assistant);
        checkpoint.getMessages().add(ChatMessage.builder().role("tool").name("editor.read")
                .toolCallId("call-1").content("Authorization: Bearer abc.def.ghi\n公开结果").build());
        checkpoint.getMessages().add(ChatMessage.builder().role("user")
                .content("请把当前会话提炼成个人技能并保存").build());
        ChatMessage saveAssistant = ChatMessage.builder().role("assistant")
                .content("正在保存，不能让这段确认改变指纹").build();
        saveAssistant.setToolCalls(Arrays.asList(new ChatMessage.ToolCallInfo("save-1", "function",
                new ChatMessage.ToolCallInfo.FunctionInfo("save_conversation_as_skill", "{}"))));
        checkpoint.getMessages().add(saveAssistant);
        checkpoint.getMessages().add(ChatMessage.builder().role("tool")
                .name("save_conversation_as_skill").toolCallId("save-1")
                .content("{\"skillId\":\"generated-id\"}").build());
        checkpoint.getMessages().add(ChatMessage.builder().role("tool")
                .name("editor.write").toolCallId("write-2")
                .content("保存请求后的同轮工作结果").build());

        ConversationTranscriptProjector.Projection first = projector.projectForTool(checkpoint);

        Checkpoint withoutSaveArtifacts = new Checkpoint();
        withoutSaveArtifacts.setToken(checkpoint.getToken());
        withoutSaveArtifacts.getMessages().addAll(checkpoint.getMessages());
        withoutSaveArtifacts.getMessages().remove(saveAssistant);
        withoutSaveArtifacts.getMessages().removeIf(message ->
                "save_conversation_as_skill".equals(message.getName()));
        ConversationTranscriptProjector.Projection second = projector.projectForTool(withoutSaveArtifacts);

        assertEquals(first.getTranscript(), second.getTranscript());
        assertEquals(first.getFingerprint(), second.getFingerprint());
        assertTrue(first.getTranscript().contains("editor.read"));
        assertTrue(first.getTranscript().contains("公开结果"));
        assertTrue(first.getTranscript().contains("保存请求后的同轮工作结果"));
        assertTrue(first.getTranscript().contains("[REDACTED]"));
        assertFalse(first.getTranscript().contains("hidden system prompt"));
        assertFalse(first.getTranscript().contains("private reasoning"));
        assertFalse(first.getTranscript().contains("jwt-must-never-appear"));
        assertFalse(first.getTranscript().contains("hunter2"));
        assertFalse(first.getTranscript().contains("secret-key"));
        assertFalse(first.getTranscript().contains("call-1"));
        assertFalse(first.getTranscript().contains("正在保存"));
        assertFalse(first.getTranscript().contains("generated-id"));
    }

    @Test
    void completedProjectionIncludesTerminalVisibleAnswer() {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.getMessages().add(ChatMessage.builder().role("user").content("整理会议记录").build());
        checkpoint.getMessages().add(ChatMessage.builder().role("assistant").content("最终会议纪要").build());

        ConversationTranscriptProjector.Projection projection = projector.projectCompletedRun(checkpoint);

        assertTrue(projection.getTranscript().contains("最终会议纪要"));
    }
}
