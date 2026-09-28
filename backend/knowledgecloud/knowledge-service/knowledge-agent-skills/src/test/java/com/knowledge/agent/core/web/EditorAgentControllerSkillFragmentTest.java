package com.knowledge.agent.core.web;

import com.knowledge.agent.core.memory.MemoryStore;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.agent.core.supervisor.ThreadStore;
import com.knowledge.agent.core.tool.ToolSpec;
import com.knowledge.agent.core.web.dto.CreateRunRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A run request's skills must reach the loop with their tool names attached.
 *
 * <p>The client declares {@code skills[].requiredTools / optionalTools} because a
 * fragment describes steps in prose without spelling function names: without the
 * association rendered under the fragment, the model has to guess which function
 * a prose step ("find-and-replace content") means.
 *
 * <p>It also pins the overflow path: only tools the provider's tool ceiling could
 * not fit may end up in the deferred catalog, and never one that is already
 * advertised — that would take its schema back out of the model's tool list.
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
        request.setSkills(Collections.singletonList(skill));

        // The advertised tools, then the overflow past the provider's ceiling.
        ToolSpec replaceContent = tool("replaceContent");
        request.setTools(new ArrayList<>(Collections.singletonList(replaceContent)));
        request.setDeferredTools(new ArrayList<>(Arrays.asList(
                tool("insertNear"),
                // Already advertised → must NOT be re-registered as deferred, or
                // its schema would leave the model's tool list.
                tool("replaceContent"))));

        controller.create(request);

        ArgumentCaptor<CreateRunCommand> captor = ArgumentCaptor.forClass(CreateRunCommand.class);
        verify(supervisor).create(captor.capture());
        return captor.getValue();
    }

    private ToolSpec tool(String name) {
        ToolSpec spec = new ToolSpec();
        spec.setName(name);
        spec.setDescription(name + " description");
        return spec;
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
    void overflowToolsLandInTheDeferredCatalogWithoutDuplicatingAdvertisedOnes() {
        List<ToolSpec> deferred = capturedCommand().getSkillTools();
        assertEquals(Collections.singletonList("insertNear"),
                deferred.stream().map(ToolSpec::getName).collect(java.util.stream.Collectors.toList()),
                "only the overflow may be deferred, and it must stay callable");
    }
}
