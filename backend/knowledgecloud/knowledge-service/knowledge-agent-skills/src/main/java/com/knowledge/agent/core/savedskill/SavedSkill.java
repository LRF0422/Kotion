package com.knowledge.agent.core.savedskill;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** Durable owner-scoped reusable procedure compiled from a conversation. */
@Data
public class SavedSkill {

    private String skillId;

    private Long tenantId;

    private Long userId;

    private String name;

    private String description;

    private String triggerText;

    private List<String> exampleIntents = new ArrayList<>();

    private List<String> tags = new ArrayList<>();

    private String systemPromptFragment;

    private List<String> requiredToolNames = new ArrayList<>();

    private List<String> optionalToolNames = new ArrayList<>();

    private String sourceConversationId;

    private String sourceRunId;

    private String sourceSchemaVersion = "v1";

    private String sourceFingerprint;

    private boolean enabled = true;

    private int version = 1;

    private long useCount;

    private Long lastUsedTime;

    private String embeddingRef;

    private long createTime;

    private long updateTime;
}
