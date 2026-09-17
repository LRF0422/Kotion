package com.knowledge.wiki.service.security;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which plugin-config fields hold credentials.
 *
 * <p>
 * Plugin configs used to be persisted verbatim — including API keys, GitHub
 * PATs, Zhihu access secrets and NetEase account cookies — into the
 * {@code wiki_plugin_config.config} JSON column. Those fields are now split out
 * and stored AES-256-GCM encrypted in {@code secret_config}, and the read API
 * only ever returns {@link #MASK}.
 * </p>
 *
 * <p>
 * Detection is the union of an explicit per-plugin declaration (mirroring the
 * {@code secretFields} declared by the front-end plugins) and a conservative
 * name heuristic, so a plugin that forgets to declare a credential still gets
 * encrypted rather than silently stored in the clear.
 * </p>
 *
 * <p>
 * Keep {@code SUFFIXES} in sync with
 * {@code packages/common/src/services/plugin-secrets.ts}.
 * </p>
 */
public final class PluginSecretFields {

    /**
     * Placeholder returned in place of a stored credential. Posting the mask
     * back means "keep the stored value".
     */
    public static final String MASK = "__KN_SECRET_MASK__";

    /** Explicit declarations, keyed by pluginKey. */
    private static final Map<String, Set<String>> DECLARED;

    static {
        Map<String, Set<String>> declared = new HashMap<String, Set<String>>();
        declared.put("ai-settings", Collections.singleton("apiKey"));
        declared.put("github-settings", Collections.singleton("personalAccessToken"));
        declared.put("zhihu-settings", Collections.singleton("accessSecret"));
        declared.put("netease-music-settings", Collections.singleton("cookie"));
        DECLARED = Collections.unmodifiableMap(declared);
    }

    /**
     * Normalized name suffixes that identify a credential. Suffix (not
     * substring) matching keeps {@code maxTokens}, {@code tokenCount} and
     * {@code cookiesEnabled} out of the secret set.
     */
    private static final List<String> SUFFIXES = Collections.unmodifiableList(Arrays.asList(
            "apikey",
            "apisecret",
            "accesskey",
            "accesssecret",
            "secretkey",
            "clientsecret",
            "privatekey",
            "personalaccesstoken",
            "accesstoken",
            "authtoken",
            "bearertoken",
            "refreshtoken",
            "token",
            "password",
            "passwd",
            "pwd",
            "credential",
            "credentials",
            "authorization",
            "cookie",
            "secret"));

    private PluginSecretFields() {
    }

    /**
     * Secret fields for one config: the declaration for {@code pluginKey} plus
     * every credential-looking key present in {@code config}.
     */
    public static Set<String> forPlugin(String pluginKey, Map<String, Object> config) {
        Set<String> fields = new LinkedHashSet<String>();
        Set<String> declared = pluginKey == null ? null : DECLARED.get(pluginKey);
        if (declared != null) {
            fields.addAll(declared);
        }
        if (config != null) {
            for (String name : config.keySet()) {
                if (isSecretFieldName(name)) {
                    fields.add(name);
                }
            }
        }
        return fields;
    }

    /** Heuristic: does this config field name look like it holds a credential? */
    public static boolean isSecretFieldName(String name) {
        if (name == null) {
            return false;
        }
        String normalized = normalize(name);
        for (String suffix : SUFFIXES) {
            if (normalized.equals(suffix) || normalized.endsWith(suffix)) {
                return true;
            }
        }
        return false;
    }

    /** True when a stored value is the redaction sentinel rather than a credential. */
    public static boolean isMask(Object value) {
        return value instanceof String && MASK.equals(value);
    }

    /**
     * True only for a usable plaintext credential. Masks, {@code null} and
     * empty/blank strings are all "no value".
     */
    public static boolean hasValue(Object value) {
        return value instanceof String
                && !((String) value).isEmpty()
                && !MASK.equals(value);
    }

    private static String normalize(String name) {
        StringBuilder builder = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '-' || c == '_' || Character.isWhitespace(c)) {
                continue;
            }
            builder.append(Character.toLowerCase(c));
        }
        return builder.toString();
    }
}
