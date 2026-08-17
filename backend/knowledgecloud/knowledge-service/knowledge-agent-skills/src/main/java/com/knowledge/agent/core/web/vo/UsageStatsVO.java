package com.knowledge.agent.core.web.vo;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * View objects for admin usage aggregation (source: agent_run).
 */
public final class UsageStatsVO {

    private UsageStatsVO() {
    }

    /** Daily token consumption. */
    @Data
    public static class DailyTokens implements Serializable {
        private static final long serialVersionUID = 1L;
        /** yyyy-MM-dd */
        private String date;
        private Long promptTokens;
        private Long completionTokens;
        private Long totalTokens;
        private Long sessions;
    }

    /** Per-user usage ranking. */
    @Data
    public static class ByUser implements Serializable {
        private static final long serialVersionUID = 1L;
        private Long userId;
        private String userName;
        private Long sessions;
        private Long promptTokens;
        private Long completionTokens;
        private Long totalTokens;
    }

    /** Per-model usage with estimated cost. */
    @Data
    public static class ByModel implements Serializable {
        private static final long serialVersionUID = 1L;
        private String modelName;
        private Long sessions;
        private Long promptTokens;
        private Long completionTokens;
        private Long totalTokens;
        /** Estimated cost = tokens / 1000 * unit price; 0 when no price configured. */
        private BigDecimal cost;
        private String currency;
    }
}
