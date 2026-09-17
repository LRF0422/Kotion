package com.knowledge.wiki.service.entity.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
public class PluginConfigVO implements Serializable {

    private Long id;
    private Long userId;
    private String pluginKey;

    /**
     * Plugin configuration. Credential fields are never returned in the clear:
     * each configured one carries the redaction sentinel
     * ({@code __KN_SECRET_MASK__}) so the client can render "configured, leave
     * blank to keep" and echo the sentinel back on save.
     */
    private Map<String, Object> config;

    /**
     * Names of the credential fields present in {@link #config} as masks.
     * Lets a client declare them without hard-coding the registry.
     */
    private List<String> secretFields;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
