package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_plugin_config", autoResultMap = true)
public class PluginConfig extends TenantEntity {

    private Long id;
    private Long userId;
    private String pluginKey;

    /**
     * Non-sensitive plugin configuration. Credential fields are never stored
     * here — see {@link #secretConfig}.
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> config;

    /**
     * AES-256-GCM encrypted JSON map of the credential fields stripped out of
     * {@link #config}, e.g. {@code {"apiKey":"sk-..."}}.
     *
     * <p>
     * Kept in a dedicated column so the plaintext config stays queryable and the
     * read API can mask credentials without decrypting anything else. Null when
     * the plugin has no configured credential.
     * </p>
     *
     * <p>
     * {@code updateStrategy = IGNORED} is required: clearing the last credential
     * saves {@code null} here, and MyBatis-Plus would otherwise skip the column
     * and leave the previous ciphertext behind.
     * </p>
     */
    @TableField(value = "secret_config", updateStrategy = FieldStrategy.IGNORED)
    private String secretConfig;
}
