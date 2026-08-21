package com.knowledge.wiki.service.entity.dto;

import java.util.Map;

import lombok.Data;

/**
 * A whole document, for the server to diff against current state itself.
 * <p>
 * This is the single exit for every path where the writer cannot describe its
 * change as ops: session start (the collaboration room may still hold a previous
 * session's document), a client that never synced successfully, a room that was
 * evicted or a collaboration server that restarted, a client resuming from
 * sleep, and import. Normal editing goes through {@code /ops}; anything
 * uncertain reconciles.
 * </p>
 */
@Data
public class ReconcileDTO {

    private Long baseRev;

    /** The submitting client's session identity; see {@link ApplyOpsDTO#getClientId()}. */
    private String clientId;

    /**
     * The full ProseMirror document, {@code {type: "doc", content: [...]}}.
     */
    private Map<String, Object> doc;

}
