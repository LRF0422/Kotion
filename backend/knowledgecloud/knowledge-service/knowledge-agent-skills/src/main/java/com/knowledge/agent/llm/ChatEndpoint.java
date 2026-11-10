package com.knowledge.agent.llm;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * Resolves the absolute chat-completions URL for an OpenAI-compatible provider.
 *
 * <p>Third-party vendors hand out their base URL in several shapes:
 * <ul>
 *   <li>origin only — {@code https://api.deepseek.com}</li>
 *   <li>with a version segment — {@code https://<host>/v1},
 *       {@code https://dashscope.aliyuncs.com/compatible-mode/v1},
 *       {@code https://ark.cn-beijing.volces.com/api/v3}</li>
 *   <li>the complete endpoint — {@code https://<host>/v1/chat/completions}</li>
 *   <li>a non-{@code /v1} path — {@code https://open.bigmodel.cn/api/paas/v4}</li>
 * </ul>
 *
 * <p>Plain concatenation is wrong for the second shape: {@code https://<host>/v1}
 * plus the default {@code /v1/chat/completions} becomes
 * {@code /v1/v1/chat/completions}, which the gateway answers with 404. This
 * resolver joins both parts without duplicating a leading segment the base URL
 * already carries, so every shape above works with the default chat path.
 */
public final class ChatEndpoint {

    /** OpenAI-style chat-completions path used when {@code chat-path} is not set. */
    public static final String DEFAULT_CHAT_PATH = "/v1/chat/completions";

    private ChatEndpoint() {
    }

    /**
     * @param baseUrl  provider base URL, e.g. {@code https://<host>/v1}; must be an
     *                 absolute http(s) URL
     * @param chatPath path relative to the base URL, a complete URL, or blank for
     *                 {@link #DEFAULT_CHAT_PATH}
     * @return the absolute URL the client must POST to
     * @throws IllegalArgumentException when the base URL is missing or not an
     *                                  absolute http(s) URL
     */
    public static String resolve(String baseUrl, String chatPath) {
        if (baseUrl == null || baseUrl.trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "LLM provider base-url is missing; set agent.providers.<name>.base-url");
        }

        String requestedPath = chatPath == null || chatPath.trim().isEmpty()
                ? DEFAULT_CHAT_PATH
                : chatPath.trim();

        // Some vendors hand out the full completions endpoint as the "base URL";
        // an explicit absolute chat-path wins over everything.
        if (isAbsoluteHttpUrl(requestedPath)) {
            return requestedPath;
        }

        URI base;
        try {
            base = new URI(baseUrl.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException(
                    "Invalid LLM provider base-url '" + baseUrl + "': " + e.getMessage(), e);
        }
        String scheme = base.getScheme();
        if (scheme == null || base.getRawAuthority() == null
                || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException("Invalid LLM provider base-url '" + baseUrl
                    + "': expected an absolute http(s) URL such as https://<host>/v1");
        }

        // Split the requested path into path + query. Azure-style endpoints carry
        // the api-version in the path query, so it must survive the join.
        String path = requestedPath;
        String pathQuery = "";
        int queryIndex = path.indexOf('?');
        if (queryIndex >= 0) {
            pathQuery = path.substring(queryIndex);
            path = path.substring(0, queryIndex);
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        String basePath = stripTrailingSlashes(nullToEmpty(base.getRawPath()));
        String query = pathQuery;
        if (query.isEmpty() && base.getRawQuery() != null && !base.getRawQuery().isEmpty()) {
            query = "?" + base.getRawQuery();
        }

        String origin = scheme + "://" + base.getRawAuthority();

        // The base URL is already the complete endpoint.
        if (!basePath.isEmpty() && endsWithPath(basePath, path)) {
            return origin + basePath + query;
        }

        // Drop a leading segment the base URL already carries:
        //   base "/v1" + path "/v1/chat/completions" -> "/v1" + "/chat/completions"
        //   base "/api/v3" + path "/v1/chat/completions" -> "/api/v3" + "/chat/completions"
        // The second case treats any API-version-looking segment as already present:
        // a vendor that publishes ".../api/v3" does not want another "/v1" appended.
        String firstSegment = firstSegment(path);
        if (!basePath.isEmpty() && !firstSegment.isEmpty()) {
            String baseLastSegment = lastSegment(basePath);
            boolean duplicated = baseLastSegment.equalsIgnoreCase(firstSegment)
                    || (isVersionSegment(baseLastSegment) && isVersionSegment(firstSegment));
            if (duplicated) {
                path = path.substring(1 + firstSegment.length());
            }
        }

        return origin + basePath + path + query;
    }

    /** Whether a path segment is an API version marker ("v1", "v2", "v1beta", ...). */
    private static boolean isVersionSegment(String segment) {
        if (segment == null || segment.length() < 2) {
            return false;
        }
        if (segment.charAt(0) != 'v' && segment.charAt(0) != 'V') {
            return false;
        }
        return Character.isDigit(segment.charAt(1));
    }

    /** Whether {@code chat-path} is already a complete http(s) URL. */
    static boolean isAbsoluteHttpUrl(String value) {
        if (value == null) {
            return false;
        }
        String lower = value.trim().toLowerCase();
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String stripTrailingSlashes(String value) {
        String result = value;
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    /** First non-empty path segment, e.g. "/v1/chat/completions" -> "v1". */
    private static String firstSegment(String path) {
        String trimmed = path;
        while (trimmed.startsWith("/")) {
            trimmed = trimmed.substring(1);
        }
        int slash = trimmed.indexOf('/');
        return slash >= 0 ? trimmed.substring(0, slash) : trimmed;
    }

    /** Last path segment, e.g. "/api/paas/v4" -> "v4". */
    private static String lastSegment(String path) {
        String trimmed = path;
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        int slash = trimmed.lastIndexOf('/');
        return slash >= 0 ? trimmed.substring(slash + 1) : trimmed;
    }

    /** Whether {@code basePath} ends with {@code path} on a segment boundary. */
    private static boolean endsWithPath(String basePath, String path) {
        return basePath.equals(path)
                || (basePath.endsWith(path)
                        && (path.startsWith("/") && path.length() > 1));
    }
}