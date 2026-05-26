package com.knowledge.wiki.service.entity.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Map;

@Data
public class PluginConfigVO implements Serializable {

    private Long id;
    private Long userId;
    private String pluginKey;
    private Map<String, Object> config;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
