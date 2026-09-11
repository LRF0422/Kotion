package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PluginBatchReviewFailureVO implements Serializable {

    private Long id;
    private String message;
}
