package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;

import lombok.Data;

@Data
public class PluginReviewDTO implements Serializable {

    @NotNull(message = "审核决定不能为空")
    private PluginReviewDecision decision;
}
