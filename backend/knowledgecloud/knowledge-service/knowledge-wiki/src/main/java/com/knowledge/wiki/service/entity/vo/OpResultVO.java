package com.knowledge.wiki.service.entity.vo;

import java.util.Map;

import lombok.Data;

/**
 * Outcome of a single op. Per-op and decisive — not the advisory
 * {@code conflicts[]} the old patch endpoint returned, which told the client
 * something had gone wrong without telling it what to do about it.
 */
@Data
public class OpResultVO {

    /** The op was applied. {@link #rev} carries the new page rev. */
    public static final String STATUS_APPLIED = "applied";

    /**
     * Someone else changed this block since the writer's base rev.
     * {@link #node} carries the server's current version so the writer can
     * re-apply its intent or ask the user — rather than being told only that it
     * lost.
     */
    public static final String STATUS_STALE = "stale";

    /** Validation failed. {@link #reason} says why. Retrying will not help. */
    public static final String STATUS_REJECTED = "rejected";

    private String op;

    private String blockId;

    /**
     * One of {@link #STATUS_APPLIED}, {@link #STATUS_STALE},
     * {@link #STATUS_REJECTED}.
     */
    private String status;

    /**
     * Machine-readable cause for {@code stale} and {@code rejected}.
     */
    private String reason;

    /**
     * The server's current node, populated on {@code stale}. {@code null} when the
     * block has been deleted server-side — which, with {@code reason=deleted}, is
     * itself the answer.
     */
    private Map<String, Object> node;

    /**
     * Page rev after this op, on {@code applied}.
     */
    private Long rev;

    public static OpResultVO applied(String op, String blockId, Long rev) {
        OpResultVO vo = new OpResultVO();
        vo.op = op;
        vo.blockId = blockId;
        vo.status = STATUS_APPLIED;
        vo.rev = rev;
        return vo;
    }

    public static OpResultVO stale(String op, String blockId, String reason, Map<String, Object> node) {
        OpResultVO vo = new OpResultVO();
        vo.op = op;
        vo.blockId = blockId;
        vo.status = STATUS_STALE;
        vo.reason = reason;
        vo.node = node;
        return vo;
    }

    public static OpResultVO rejected(String op, String blockId, String reason) {
        OpResultVO vo = new OpResultVO();
        vo.op = op;
        vo.blockId = blockId;
        vo.status = STATUS_REJECTED;
        vo.reason = reason;
        return vo;
    }

}
