package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;
import com.knowledge.wiki.service.entity.enums.PluginReviewReason;

import lombok.Data;

/**
 * Batch review request. Each id is applied under its own transaction so one bad
 * item cannot roll back the whole batch.
 */
@Data
public class PluginBatchReviewDTO implements Serializable {

    @NotEmpty(message = "请至少选择一个插件")
    private List<Long> ids;

    @NotNull(message = "审核决定不能为空")
    private PluginReviewDecision decision;

    @Size(max = 500, message = "审核意见长度不能超过500")
    private String reason;

    private PluginReviewReason reasonCode;
}
