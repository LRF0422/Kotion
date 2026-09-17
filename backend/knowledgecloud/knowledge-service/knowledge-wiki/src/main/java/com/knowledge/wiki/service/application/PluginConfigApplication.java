package com.knowledge.wiki.service.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.wiki.service.converter.PluginConfigConverter;
import com.knowledge.wiki.service.entity.PluginConfig;
import com.knowledge.wiki.service.entity.vo.PluginConfigVO;
import com.knowledge.wiki.service.security.PluginConfigCryptoService;
import com.knowledge.wiki.service.security.PluginSecretFields;
import com.knowledge.wiki.service.service.IPluginConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Plugin configuration use cases.
 *
 * <h3>Credential handling</h3>
 * A plugin config may carry credentials (AI API keys, GitHub PATs, Zhihu access
 * secrets, NetEase cookies). Those are:
 *
 * <ul>
 * <li><b>stripped</b> out of {@code wiki_plugin_config.config} on write;</li>
 * <li><b>encrypted</b> with AES-256-GCM into {@code secret_config};</li>
 * <li><b>masked</b> with {@link PluginSecretFields#MASK} on every read, so the
 * plaintext never leaves the server except through the dedicated
 * {@code /reveal} endpoint;</li>
 * <li><b>preserved</b> when the client echoes the mask back ("leave blank to
 * keep"), and cleared when it sends an empty string.</li>
 * </ul>
 *
 * <p>
 * Records written before this change kept credentials in the plaintext
 * {@code config} column. They are migrated transparently on first read: the
 * credential is encrypted into {@code secret_config} and removed from
 * {@code config}. If the encryption key is not configured the migration is
 * skipped and reads stay degraded to "masked, value unavailable" — a credential
 * is never served in the clear and never silently dropped.
 * </p>
 */
@Service
@Slf4j
public class PluginConfigApplication {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private IPluginConfigService pluginConfigService;

    @Autowired
    private PluginConfigCryptoService cryptoService;

    /**
     * Get a single plugin config.
     * Returns {@code null} when the record does not exist so that the controller
     * layer can translate it into an HTTP 404 response, matching the documented
     * API contract.
     */
    public PluginConfigVO getPluginConfig(String pluginKey) {
        Long userId = requireUserId();
        log.debug("Getting plugin config for user: {}, pluginKey: {}", userId, pluginKey);

        PluginConfig config = pluginConfigService.getByUserIdAndPluginKey(userId, pluginKey);
        if (config == null) {
            return null;
        }
        return toVO(migrateLegacyPlaintextSecrets(config));
    }

    /**
     * Save/Update a plugin config (UPSERT semantics).
     *
     * <p>
     * Credential fields posted as {@link PluginSecretFields#MASK} keep their
     * stored value; a real value replaces it; {@code ""}/{@code null} clears it.
     * </p>
     */
    public PluginConfigVO savePluginConfig(String pluginKey, Map<String, Object> incomingConfig) {
        Long userId = requireUserId();
        log.info("Saving plugin config for user: {}, pluginKey: {}", userId, pluginKey);

        Map<String, Object> payload = incomingConfig == null
                ? new LinkedHashMap<String, Object>()
                : incomingConfig;
        PluginConfig existing = pluginConfigService.getByUserIdAndPluginKey(userId, pluginKey);

        // Refuse to write over ciphertext we cannot read: merging would start from
        // an empty credential set and silently drop the user's stored secrets.
        if (hasUnreadableStoredSecrets(existing)) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Stored plugin credentials cannot be decrypted (check "
                            + "knowledge.plugin-config.crypto-key); refusing to overwrite them.");
        }

        // Start from whatever is already stored (including legacy plaintext that
        // has not been migrated yet) and apply the incoming payload on top.
        Map<String, String> secrets = existing == null
                ? new LinkedHashMap<String, String>()
                : readStoredSecrets(existing);

        Set<String> secretFields = PluginSecretFields.forPlugin(pluginKey, payload);
        Map<String, Object> publicConfig = new LinkedHashMap<String, Object>();

        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            String name = entry.getKey();
            Object value = entry.getValue();

            if (!secretFields.contains(name)) {
                publicConfig.put(name, value);
                continue;
            }
            // A credential field never lands in the plaintext column, whatever
            // type the client sent.
            if (PluginSecretFields.isMask(value)) {
                continue; // "keep the stored value"
            }
            if (!(value instanceof String)) {
                log.warn("Ignoring non-string value for secret field '{}' of plugin '{}'", name, pluginKey);
                continue;
            }
            String text = (String) value;
            if (text.isEmpty()) {
                secrets.remove(name);
                continue;
            }
            secrets.put(name, text);
        }

        String encrypted = null;
        if (!secrets.isEmpty()) {
            if (!cryptoService.isEnabled()) {
                // Fail closed: refuse to write rather than fall back to plaintext.
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Plugin credential encryption is not configured on the server; "
                                + "the configuration was not saved.");
            }
            encrypted = cryptoService.encrypt(toJson(secrets));
        }

        PluginConfig saved = pluginConfigService.saveOrUpdate(userId, pluginKey, publicConfig, encrypted);
        log.info("Plugin config saved successfully for pluginKey: {}", pluginKey);

        return toVO(saved);
    }

    public List<PluginConfigVO> getAllPluginConfigs() {
        Long userId = requireUserId();
        log.debug("Getting all plugin configs for user: {}", userId);

        List<PluginConfig> configs = pluginConfigService.getAllByUserId(userId);

        return configs.stream()
                .map(this::migrateLegacyPlaintextSecrets)
                .map(this::toVO)
                .collect(Collectors.toList());
    }

    /**
     * Decrypted credentials of one plugin config, for clients that must call a
     * third-party API from the browser.
     *
     * <p>
     * The caller is authenticated and scoped to their own records, so this only
     * re-exposes what the user themselves stored. Values must be kept in memory
     * client-side.
     * </p>
     */
    public Map<String, String> revealSecrets(String pluginKey) {
        Long userId = requireUserId();
        log.info("Revealing plugin secrets for user: {}, pluginKey: {}", userId, pluginKey);

        PluginConfig config = pluginConfigService.getByUserIdAndPluginKey(userId, pluginKey);
        if (config == null) {
            return Collections.emptyMap();
        }
        return readStoredSecrets(migrateLegacyPlaintextSecrets(config));
    }

    // ─── Credential plumbing ─────────────────────────────────

    /**
     * Encrypt credentials that a pre-change record still keeps in the plaintext
     * {@code config} column, then strip them from it.
     *
     * <p>
     * Never throws: when the crypto key is unavailable the record is returned
     * untouched (reads stay masked, writes stay refused) so a missing key cannot
     * take the whole configuration API down, and no plaintext is ever served.
     * </p>
     */
    private PluginConfig migrateLegacyPlaintextSecrets(PluginConfig entity) {
        Map<String, Object> stored = entity.getConfig();
        if (stored == null || stored.isEmpty()) {
            return entity;
        }

        Map<String, String> legacy = new LinkedHashMap<String, String>();
        for (Map.Entry<String, Object> entry : stored.entrySet()) {
            if (PluginSecretFields.isSecretFieldName(entry.getKey())
                    && PluginSecretFields.hasValue(entry.getValue())) {
                legacy.put(entry.getKey(), (String) entry.getValue());
            }
        }
        if (legacy.isEmpty()) {
            return entity;
        }

        if (!cryptoService.isEnabled()) {
            log.error("Legacy plaintext credential(s) {} of plugin '{}' cannot be migrated because plugin "
                            + "credential encryption is not configured. They will not be returned to clients, "
                            + "but the database row still holds them in the clear until the key is set.",
                    legacy.keySet(), entity.getPluginKey());
            return entity;
        }

        try {
            Map<String, String> merged = readSecretsFromColumn(entity);
            merged.putAll(legacy);

            Map<String, Object> cleaned = new LinkedHashMap<String, Object>(stored);
            for (String name : legacy.keySet()) {
                cleaned.remove(name);
            }

            entity.setConfig(cleaned);
            entity.setSecretConfig(cryptoService.encrypt(toJson(merged)));
            pluginConfigService.updateById(entity);
            log.info("Migrated legacy plaintext plugin credential(s) {} of plugin '{}' into encrypted storage",
                    legacy.keySet(), entity.getPluginKey());
            return entity;
        } catch (RuntimeException e) {
            log.error("Failed to migrate legacy plaintext plugin credential(s) of plugin '{}'",
                    entity.getPluginKey(), e);
            return entity;
        }
    }

    /**
     * Every credential known for a record: the encrypted column plus any legacy
     * plaintext still sitting in {@code config}.
     */
    private Map<String, String> readStoredSecrets(PluginConfig entity) {
        Map<String, String> secrets = readSecretsFromColumn(entity);

        Map<String, Object> stored = entity.getConfig();
        if (stored != null) {
            for (Map.Entry<String, Object> entry : stored.entrySet()) {
                if (PluginSecretFields.isSecretFieldName(entry.getKey())
                        && PluginSecretFields.hasValue(entry.getValue())) {
                    secrets.put(entry.getKey(), (String) entry.getValue());
                }
            }
        }
        return secrets;
    }

    /**
     * True when the row holds ciphertext this instance cannot read (key missing
     * or rotated). Saving on top of it would start from an empty credential set
     * and silently drop the user's secrets, so writes are refused instead.
     */
    private boolean hasUnreadableStoredSecrets(PluginConfig entity) {
        if (entity == null) {
            return false;
        }
        String stored = entity.getSecretConfig();
        if (stored == null || stored.isEmpty()) {
            return false;
        }
        if (!cryptoService.isEnabled()) {
            return true;
        }
        try {
            cryptoService.decrypt(stored);
            return false;
        } catch (RuntimeException e) {
            return true;
        }
    }

    /** Decrypt the {@code secret_config} column. Returns an empty map on failure. */
    private Map<String, String> readSecretsFromColumn(PluginConfig entity) {
        String stored = entity.getSecretConfig();
        if (stored == null || stored.isEmpty()) {
            return new LinkedHashMap<String, String>();
        }
        try {
            Map<String, String> parsed = parseSecrets(cryptoService.decrypt(stored));
            return parsed == null ? new LinkedHashMap<String, String>() : parsed;
        } catch (RuntimeException e) {
            // A missing/rotated key must not take the config API down, and the
            // affected fields stay masked because they are absent from `config`.
            log.error("Unable to decrypt stored plugin credentials for plugin '{}' (user {}). "
                            + "Check knowledge.plugin-config.crypto-key.",
                    entity.getPluginKey(), entity.getUserId(), e);
            return new LinkedHashMap<String, String>();
        }
    }

    /**
     * Build the response: credential fields are replaced by the mask, and the
     * mask is present even when the value could not be decrypted, so the client
     * still knows a credential is configured.
     */
    private PluginConfigVO toVO(PluginConfig entity) {
        Set<String> secretFields = new LinkedHashSet<String>();
        boolean hasEncryptedSecrets = entity.getSecretConfig() != null && !entity.getSecretConfig().isEmpty();

        if (hasEncryptedSecrets) {
            secretFields.addAll(readSecretsFromColumn(entity).keySet());
            // Declared credentials stay marked as configured even when they could
            // not be decrypted, so the client does not treat them as unset and
            // drop them on the next save.
            secretFields.addAll(PluginSecretFields.forPlugin(entity.getPluginKey(), null));
        }

        Map<String, Object> stored = entity.getConfig();
        if (stored != null) {
            for (Map.Entry<String, Object> entry : stored.entrySet()) {
                if (PluginSecretFields.isSecretFieldName(entry.getKey())
                        && PluginSecretFields.hasValue(entry.getValue())) {
                    secretFields.add(entry.getKey());
                }
            }
        }

        PluginConfigVO vo = PluginConfigConverter.INSTANCE.convertVO(entity);
        Map<String, Object> config = vo.getConfig() == null
                ? new LinkedHashMap<String, Object>()
                : new LinkedHashMap<String, Object>(vo.getConfig());

        List<String> secretFieldList = new ArrayList<String>(secretFields);
        for (String field : secretFieldList) {
            config.put(field, PluginSecretFields.MASK);
        }

        vo.setConfig(config);
        vo.setSecretFields(secretFieldList);
        return vo;
    }

    private static String toJson(Map<String, String> secrets) {
        try {
            return OBJECT_MAPPER.writeValueAsString(secrets);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize plugin secrets", e);
        }
    }

    private static Map<String, String> parseSecrets(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new LinkedHashMap<String, String>();
        }
        try {
            Map<String, String> parsed = OBJECT_MAPPER.readValue(json, new TypeReference<Map<String, String>>() {
            });
            return parsed == null ? new LinkedHashMap<String, String>() : parsed;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse plugin secrets payload", e);
        }
    }

    /**
     * Ensure an authenticated user context exists before touching plugin configs.
     */
    private Long requireUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (Func.isNull(userId) || userId <= 0L) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    ResultCode.UN_AUTHORIZED.getMessage());
        }
        return userId;
    }
}
