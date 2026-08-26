package com.knowledge.wiki.service.util;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.exception.WikiException;

import cn.hutool.core.util.StrUtil;

public final class PluginSubmissionValidator {

    private static final Pattern PLUGIN_KEY = Pattern.compile("^[a-z0-9-]{2,50}$");
    private static final Pattern SEMVER = Pattern.compile("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$");
    private static final Pattern INTEGRITY = Pattern.compile("^sha384-[A-Za-z0-9+/]{64}$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private PluginSubmissionValidator() {
    }

    public static String requirePluginKey(String pluginKey) {
        String normalized = StrUtil.trim(pluginKey);
        if (normalized == null || !PLUGIN_KEY.matcher(normalized).matches()) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return normalized;
    }

    public static String requireText(String value, int minLength, int maxLength) {
        String normalized = StrUtil.trim(value);
        if (normalized == null || normalized.length() < minLength || normalized.length() > maxLength) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return normalized;
    }

    public static String requireSemanticVersion(String version) {
        String normalized = StrUtil.trim(version);
        if (normalized == null || normalized.length() > 64 || !SEMVER.matcher(normalized).matches()) {
            throw WikiException.PLUGIN_INVALID_VERSION.newException();
        }
        return normalized;
    }

    public static int compareSemanticVersions(String left, String right) {
        String[] a = requireSemanticVersion(left).split("\\.");
        String[] b = requireSemanticVersion(right).split("\\.");
        for (int i = 0; i < 3; i++) {
            int result = new BigInteger(a[i]).compareTo(new BigInteger(b[i]));
            if (result != 0) {
                return result;
            }
        }
        return 0;
    }

    public static String nextPatchVersion(String version) {
        String[] parts = requireSemanticVersion(version).split("\\.");
        return requireSemanticVersion(parts[0] + "." + parts[1] + "."
                + new BigInteger(parts[2]).add(BigInteger.ONE));
    }

    public static List<String> normalizeTags(List<String> tags) {
        if (tags == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String tag : tags) {
            String value = StrUtil.trim(tag);
            if (StrUtil.isBlank(value) || value.length() > 30) {
                throw WikiException.INVALID_PARAMETER.newException();
            }
            normalized.add(value.toLowerCase(Locale.ROOT));
        }
        if (normalized.isEmpty() || normalized.size() > 5) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return new ArrayList<>(normalized);
    }

    public static String optionalObjectPath(String path) {
        if (StrUtil.isBlank(path)) {
            return null;
        }
        return canonicalObjectPath(path);
    }

    public static String requireJavaScriptPath(String path) {
        String normalized = canonicalObjectPath(path);
        if (!normalized.toLowerCase(Locale.ROOT).endsWith(".js")) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return normalized;
    }

    public static String requireIntegrity(String integrity) {
        String normalized = StrUtil.trim(integrity);
        if (normalized == null || !INTEGRITY.matcher(normalized).matches()) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return normalized;
    }

    public static void validateVersionDescriptions(List<VersionDesc> descriptions) {
        if (descriptions == null || descriptions.isEmpty()) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        for (VersionDesc description : descriptions) {
            if (description == null || StrUtil.isBlank(description.getLabel())
                    || StrUtil.isBlank(description.getContent())) {
                throw WikiException.INVALID_PARAMETER.newException();
            }
            try {
                JSON.readTree(description.getContent());
            } catch (Exception ex) {
                throw WikiException.INVALID_PARAMETER.newException("版本说明内容必须是合法JSON");
            }
        }
    }

    private static String canonicalObjectPath(String path) {
        String normalized = StrUtil.trim(path);
        if (StrUtil.isBlank(normalized) || normalized.length() > 1024 || normalized.startsWith("/")
                || normalized.contains("\\") || normalized.contains("://") || normalized.contains("?")
                || normalized.contains("#") || normalized.indexOf('\0') >= 0) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        String[] segments = normalized.split("/");
        for (String segment : segments) {
            if (StrUtil.isBlank(segment) || ".".equals(segment) || "..".equals(segment)) {
                throw WikiException.INVALID_PARAMETER.newException();
            }
        }
        return normalized;
    }
}
