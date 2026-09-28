package com.knowledge.agent.core.web;

import com.knowledge.agent.core.memory.MemoryStore;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.agent.core.supervisor.ThreadStore;
import com.knowledge.agent.core.tool.ToolSpec;
import com.knowledge.agent.core.web.dto.CreateRunRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A run request's skills must reach the loop with their tool names attached.
 *
 * <p>The client declares {@code skills[].requiredTools / optionalTools} because
 * the deferred-tool directory advertises names and signatures but no
 * descriptions: without the association rendered under the fragment, the model
 * has to guess which function a prose step ("find-and-replace content") means.
 */
class EditorAgentControllerSkillFragmentTest {

    private CreateRunCommand capturedCommand() {
        DefaultRunSupervisor supervisor = mock(DefaultRunSupervisor.class);
        when(supervisor.create(any(CreateRunCommand.class))).thenReturn(null);
        EditorAgentController controller = new EditorAgentController(
                supervisor,
                mock(ThreadStore.class),
                mock(RunStreamer.class),
                mock(MemoryStore.class));

        CreateRunRequest request = new CreateRunRequest();
        request.setConversationId("conv-1");

        CreateRunRequest.SkillInput skill = new CreateRunRequest.SkillInput();
        skill.setName("document-write");
        skill.setSystemPromptFragment("You can find-and-replace content.");
        skill.setRequiredTools(Arrays.asList("replaceContent", "insertNear"));
        skill.setOptionalTools(Collections.singletonList("write"));
        ToolSpec replaceContent = new ToolSpec();
        replaceContent.setName("replaceContent");
        replaceContent.setDescription("find and replace");
        skill.setTools(Collections.singletonList(replaceContent));
        request.setSkills(Collections.singletonList(skill));

        controller.create(request);

        ArgumentCaptor<CreateRunCommand> captor = ArgumentCaptor.forClass(CreateRunCommand.class);
        verify(supervisor).create(captor.capture());
        return captor.getValue();
    }

    @Test
    void declaredToolNamesRideUnderTheirSkillFragment() {
        List<String> fragments = capturedCommand().getSkillFragments();
        assertEquals(1, fragments.size(), () -> "expected one fragment, got " + fragments);
        String fragment = fragments.get(0);
        assertTrue(fragment.contains("You can find-and-replace content."), fragment);
        assertTrue(fragment.contains("replaceContent, insertNear, write"),
                () -> "the skill's own tool names must be named under its fragment: " + fragment);
    }

    @Test
    void skillToolsStillLandInTheDeferredCatalog() {
        // The fragment association must not replace the deferred registration:
        // the schemas still have to arrive for execution.
        assertFalse(capturedCommand().getSkillTools().isEmpty(),
                "skills[].tools must still be registered as the deferred catalog");
    }
}
