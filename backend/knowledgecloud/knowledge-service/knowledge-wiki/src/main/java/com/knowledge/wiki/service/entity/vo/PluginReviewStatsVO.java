package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import lombok.Data;

/**
 * Aggregate review health for the admin console: queue sizes, approval rate,
 * average decision latency and rejection-cause distribution.
 */
@Data
public class PluginReviewStatsVO implements Serializable {

    private long pending;
    private long inProgress;
    private long approved;
    private long rejected;
    /** approved / (approved + rejected), 0 when no decisions yet. */
    private double approvalRate;
    /** Average hours between candidate creation and decision; null when no decision. */
    private Double averageReviewHours;
    private List<PluginReviewReasonCountVO> reasons = new ArrayList<>();
}
