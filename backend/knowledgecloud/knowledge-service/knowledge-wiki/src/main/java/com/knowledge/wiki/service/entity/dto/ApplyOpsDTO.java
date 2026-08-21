package com.knowledge.wiki.service.entity.dto;

import java.util.List;

import lombok.Data;

/**
 * A batch of ops from one writer.
 */
@Data
public class ApplyOpsDTO {

    /**
     * The rev the writer's document was based on.
     * <p>
     * Not a hard gate — hard-rejecting a stale base makes collaborative editing
     * unusable. It is used as a <b>target</b> for conflict detection: if
     * {@code baseRev < head.rev}, only the blocks this batch actually touches are
     * checked for having changed in between. Untouched blocks moving on is not a
     * conflict.
     * </p>
     */
    private Long baseRev;

    /**
     * Makes a retry safe. Resubmitting a batch under the same key returns the
     * original outcome instead of applying it twice — the thing the
     * {@code pagehide} / keepalive flush path has always lacked.
     */
    private String idempotencyKey;

    /**
     * The submitting client's session identity.
     * <p>
     * Required from browser clients: the controller only accepts a batch from the
     * page's session host, and this is what identifies it. Server-side writers (AI,
     * import, scheduled jobs) call the service directly and never come through the
     * controller, so they have no client identity and no lease to hold.
     * </p>
     */
    private String clientId;

    private List<BlockOpDTO> ops;

}
