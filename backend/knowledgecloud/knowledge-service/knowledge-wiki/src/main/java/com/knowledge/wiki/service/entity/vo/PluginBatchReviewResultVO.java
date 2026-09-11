package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import lombok.Data;

@Data
public class PluginBatchReviewResultVO implements Serializable {

    private int requested;
    private int succeeded;
    private List<PluginBatchReviewFailureVO> failures = new ArrayList<>();
}
