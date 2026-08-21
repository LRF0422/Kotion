package com.knowledge.wiki.service.entity.vo;

import java.util.List;

import lombok.Data;

/**
 * Outcome of an op batch.
 */
@Data
public class ApplyOpsVO {

    /**
     * Page rev after the batch. Unchanged from the caller's view of head when
     * nothing was applied — a batch that changes nothing does not burn a rev.
     */
    private Long rev;

    /**
     * How many ops actually changed something. Zero is a normal, expected
     * outcome: it is what a reconcile of an already-aligned document produces.
     */
    private int opsApplied;

    /**
     * True when this batch's {@code idempotencyKey} had already been applied and
     * the stored outcome was replayed instead of the ops being applied again.
     */
    private boolean replayed;

    private List<OpResultVO> results;

}
