package com.knowledge.wiki.service.entity.dto;

import lombok.Data;

/**
 * Identifies one editing client for the session endpoints.
 * <p>
 * {@code clientId} is per provider instance, not per user: a reload or a second
 * tab is a different client with a different document, and the write lease has to
 * be pinned to the document that is actually being edited. Keying the lease on
 * the user instead would let two tabs of one person both write, which is the
 * concurrent-writer problem the session exists to remove.
 * </p>
 */
@Data
public class SessionClaimDTO {

    private String clientId;

}
