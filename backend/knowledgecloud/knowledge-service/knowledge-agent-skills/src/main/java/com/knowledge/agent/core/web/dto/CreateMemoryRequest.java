package com.knowledge.agent.core.web.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * POST /api/agent/v1/memory request body — the memory-management UI writing a
 * memory by hand, mirroring what the agent's {@code remember} tool does.
 *
 * <p>Scope defaults to {@code user} because the settings UI has no page context;
 * {@code space}/{@code page} require the matching ids.
 */
@Data
public class CreateMemoryRequest {

    /** The memory text (required, capped by the controller). */
    private String content;

    /** fact | preference | note | episode; anything else falls back to {@code note}. */
    private String type;

    /** Importance 0-100; null = 50. */
    private Integer importance;

    private List<String> tags = new ArrayList<>();

    /** user (default) | space | page. */
    private String scope;

    /** Required for scope=space|page. */
    private String spaceId;

    /** Required for scope=page. */
    private String pageId;
}
