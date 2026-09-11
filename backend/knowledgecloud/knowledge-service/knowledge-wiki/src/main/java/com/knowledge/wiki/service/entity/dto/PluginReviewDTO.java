package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;

import lombok.Data;

@Data
public class PluginReviewDTO implements Serializable {

    @NotNull(message = "审核决定不能为空")
    private PluginReviewDecision decision;

    /**
     * Reviewer note. Required when the decision is REJECT so the developer knows
     * what must be fixed before resubmitting.
     */
    @Size(max = 500, message = "审核意见长度不能超过500")
    private String reason;
}
