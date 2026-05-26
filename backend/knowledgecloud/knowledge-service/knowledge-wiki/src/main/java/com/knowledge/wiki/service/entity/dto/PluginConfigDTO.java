package com.knowledge.wiki.service.entity.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.Map;

@Data
public class PluginConfigDTO implements Serializable {

    @NotNull(message = "config cannot be null")
    private Map<String, Object> config;
}
