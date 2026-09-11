package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class PluginRatingSummaryVO implements Serializable {

    private double rating;
    private long reviews;
    /** Current user's score, null when the user has not rated yet. */
    private Integer myScore;
}
