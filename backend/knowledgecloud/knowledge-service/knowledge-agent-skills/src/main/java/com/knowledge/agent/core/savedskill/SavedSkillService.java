package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolGateway;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Coordinates consent, transcript projection, compilation, and persistence. */
@Service
public class SavedSkillService {

    private static final String SAVE_TOOL = "save_conversation_as_skill";

    private final SavedSkillStore store;
    private final RunStore runStore;
    private final CheckpointStore checkpointStore;
    private final ExplicitSkillSaveIntentPolicy intentPolicy;
    private final ConversationTranscriptProjector projector;
    private final SavedSkillCompiler compiler;
    private final ToolGateway toolGateway;
    private final AgentCoreProperties properties;

    public SavedSkillService(SavedSkillStore store, RunStore runStore,
                             CheckpointStore checkpointStore,
                             ExplicitSkillSaveIntentPolicy intentPolicy,
                             ConversationTranscriptProjector projector,
                             SavedSkillCompiler compiler,
                             ToolGateway toolGateway,
                             AgentCoreProperties properties) {
        this.store = store;
        this.runStore = runStore;
        this.checkpointStore = checkpointStore;
        this.intentPolicy = intentPolicy;
        this.projector = projector;
        this.compiler = compiler;
        this.toolGateway = toolGateway;
        this.properties = properties;
    }

    public SavedSkillStore.SaveResult saveFromTool(ToolContext context) {
        if (context == null) {
            throw new IllegalArgumentException("SAVED_SKILL_CONTEXT_REQUIRED");
        }
        requireEnabled();
        requireIdentity(context.getTenantId(), context.getUserId());
        if (context.getDelegateDepth() > 0) {
            throw new IllegalArgumentException("SAVED_SKILL_ROOT_RUN_REQUIRED");
        }
        AgentRun run = requireOwnedRootRun(context.getRunId(), context.getTenantId(), context.getUserId());
        if (!same(run.getConversationId(), context.getConversationId())) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        Checkpoint checkpoint = requireCheckpoint(run);
        if (!intentPolicy.isExplicit(checkpoint.getMessages())) {
            throw new IllegalArgumentException("EXPLICIT_SKILL_SAVE_REQUIRED");
        }
        return compileAndSave(run, checkpoint, projector.projectForTool(checkpoint));
    }

    /** Deterministic API fallback: the authenticated POST itself is explicit consent. */
    public SavedSkillStore.SaveResult saveCompletedRun(String runId, Long tenantId, Long userId) {
        requireEnabled();
        requireIdentity(tenantId, userId);
        AgentRun run = requireOwnedRootRun(runId, tenantId, userId);
        if (run.statusEnum() != RunStatus.COMPLETED) {
            throw new IllegalArgumentException("SAVED_SKILL_COMPLETED_RUN_REQUIRED");
        }
        Checkpoint checkpoint = requireCheckpoint(run);
        return compileAndSave(run, checkpoint, projector.projectCompletedRun(checkpoint));
    }

    public List<SavedSkill> list(Long tenantId, Long userId, Boolean enabled, int offset, int limit) {
        requireIdentity(tenantId, userId);
        return store.list(tenantId, userId, enabled, Math.max(0, offset), clamp(limit, 1, 100));
    }

    public SavedSkill get(Long tenantId, Long userId, String skillId) {
        requireIdentity(tenantId, userId);
        return store.findBySkillId(tenantId, userId, skillId);
    }

    public boolean setEnabled(Long tenantId, Long userId, String skillId, boolean enabled) {
        requireIdentity(tenantId, userId);
        return store.setEnabled(tenantId, userId, skillId, enabled);
    }

    public boolean delete(Long tenantId, Long userId, String skillId) {
        requireIdentity(tenantId, userId);
        return store.delete(tenantId, userId, skillId);
    }

    private SavedSkillStore.SaveResult compileAndSave(AgentRun run, Checkpoint checkpoint,
                                                       ConversationTranscriptProjector.Projection projection) {
        SavedSkill existing = store.findByFingerprint(
                run.getTenantId(), run.getUserId(), projection.getFingerprint());
        if (existing != null) {
            return new SavedSkillStore.SaveResult(existing, false);
        }

        Set<String> allowedTools = allowedToolNames(checkpoint);
        SavedSkillDraft draft = compiler.compile(run.getModel(), projection.getTranscript(), allowedTools);
        SavedSkill skill = new SavedSkill();
        skill.setTenantId(run.getTenantId());
        skill.setUserId(run.getUserId());
        skill.setName(draft.getName());
        skill.setDescription(draft.getDescription());
        skill.setTriggerText(draft.getTriggerText());
        skill.setExampleIntents(draft.getExampleIntents());
        skill.setTags(draft.getTags());
        skill.setSystemPromptFragment(draft.getSystemPromptFragment());
        skill.setRequiredToolNames(draft.getRequiredToolNames());
        skill.setOptionalToolNames(draft.getOptionalToolNames());
        skill.setSourceConversationId(run.getConversationId());
        skill.setSourceRunId(run.getRunId());
        skill.setSourceSchemaVersion("v1");
        skill.setSourceFingerprint(projection.getFingerprint());
        skill.setEnabled(true);
        skill.setVersion(1);
        return store.saveIfAbsent(skill, clamp(
                properties.getSavedSkills().getMaxSkillsPerUser(), 1, 1000));
    }

    private Set<String> allowedToolNames(Checkpoint checkpoint) {
        Set<String> names = new LinkedHashSet<>();
        addToolNames(names, checkpoint.getClientTools());
        addToolNames(names, checkpoint.getDeferredTools());
        addToolNames(names, toolGateway.backendSpecs());
        names.remove(SAVE_TOOL);
        return names;
    }

    private void addToolNames(Set<String> names, List<ToolSpec> specs) {
        if (specs == null) {
            return;
        }
        for (ToolSpec spec : specs) {
            if (spec != null && spec.getName() != null && !spec.getName().trim().isEmpty()) {
                names.add(spec.getName().trim());
            }
        }
    }

    private AgentRun requireOwnedRootRun(String runId, Long tenantId, Long userId) {
        if (runId == null || runId.trim().isEmpty()) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        AgentRun run = runStore.load(runId);
        if (run == null || !same(run.getTenantId(), tenantId) || !same(run.getUserId(), userId)) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        if (run.getParentRunId() != null && !run.getParentRunId().trim().isEmpty()) {
            throw new IllegalArgumentException("SAVED_SKILL_ROOT_RUN_REQUIRED");
        }
        return run;
    }

    private Checkpoint requireCheckpoint(AgentRun run) {
        Checkpoint checkpoint = checkpointStore.load(run.getRunId());
        if (checkpoint == null || !same(checkpoint.getRunId(), run.getRunId())) {
            throw new IllegalArgumentException("SAVED_SKILL_CHECKPOINT_NOT_FOUND");
        }
        if (checkpoint.getDelegateDepth() > 0) {
            throw new IllegalArgumentException("SAVED_SKILL_ROOT_RUN_REQUIRED");
        }
        return checkpoint;
    }

    private void requireEnabled() {
        if (!properties.getSavedSkills().isEnabled()) {
            throw new IllegalStateException("SAVED_SKILLS_DISABLED");
        }
    }

    private void requireIdentity(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            throw new IllegalArgumentException("SAVED_SKILL_IDENTITY_REQUIRED");
        }
    }

    private boolean same(Object left, Object right) {
        return left == null ? right == null : left.equals(right);
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
