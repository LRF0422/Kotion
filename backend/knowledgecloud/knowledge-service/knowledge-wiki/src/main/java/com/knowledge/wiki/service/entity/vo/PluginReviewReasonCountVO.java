package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import com.knowledge.wiki.service.entity.enums.PluginReviewReason;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PluginReviewReasonCountVO implements Serializable {

    private PluginReviewReason reason;
    private long count;
}
