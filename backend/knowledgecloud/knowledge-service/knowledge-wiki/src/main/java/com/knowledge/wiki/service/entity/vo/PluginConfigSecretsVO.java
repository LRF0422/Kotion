package com.knowledge.wiki.service.entity.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * Decrypted credentials of a single plugin config.
 *
 * <p>
 * Returned only by {@code GET /plugin-config/{pluginKey}/reveal}, for clients
 * that must call a third-party API directly from the browser. Callers are
 * expected to keep the values in memory and never persist them.
 * </p>
 */
@Data
public class PluginConfigSecretsVO implements Serializable {

    /** Field name → decrypted value. Empty when nothing is configured. */
    private Map<String, String> secrets;
}
