package com.knowledge.agent.session;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Lightweight session POJO.
 * Jackson-friendly for Redis JSON serialization.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Session {

    private String sessionId;
    private String conversationId;
    private String provider;
    private String model;
    private List<String> activeToolIds;

    @Builder.Default
    private long createdAt = System.currentTimeMillis();

    @Builder.Default
    private long lastActiveAt = System.currentTimeMillis();
}
