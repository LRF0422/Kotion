package com.knowledge.filecenter.service;

import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpCookie;
import java.net.InetAddress;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLDecoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.knowledge.filecenter.skill.WebDownloadProperties;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Robust remote file downloader shared by the agent-facing file tools.
 *
 * <p>Compared with the previous per-skill implementations it:
 * <ul>
 *   <li><b>Streams</b> the response to a temporary file instead of buffering the
 *       whole payload as a {@code byte[]}; memory stays bounded even for large
 *       files and the size limit is enforced while streaming, not only against
 *       the (untrusted) {@code Content-Length}.</li>
 *   <li><b>Blocks SSRF</b>: only {@code http}/{@code https} is allowed, and every
 *       hop — including every redirect target — is resolved and rejected when it
 *       maps to loopback, link-local, site-local, CGNAT, unique-local or
 *       multicast addresses.</li>
 *   <li><b>Follows redirects manually</b> so the SSRF check cannot be bypassed
 *       with a 302, while still carrying cookies across hops without mutating
 *       the JVM-wide {@code CookieHandler}.</li>
 *   <li><b>Retries</b> transient failures (network errors, HTTP 429/5xx) with
 *       exponential backoff and jitter.</li>
 *   <li><b>Derives a usable name</b> from {@code Content-Disposition}
 *       (RFC 5987 {@code filename*}), the URL path and the content type, then
 *       sanitizes it.</li>
 * </ul>
 *
 * <p>The caller owns the returned {@link DownloadedFile} and must close it so
 * the temporary file is deleted.
 */
@Slf4j
@Service
public class RemoteFileDownloadService {

    private static final int BUFFER_SIZE = 8192;
    private static final int MAX_SUFFIX_LENGTH = 20;
    private static final long RETRY_BASE_DELAY_MS = 1000L;
    private static final int RETRY_MAX_JITTER_MS = 500;

    private static final Pattern CONTENT_DISPOSITION_STAR =
            Pattern.compile("filename\\*\\s*=\\s*([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONTENT_DISPOSITION_PLAIN =
            Pattern.compile("filename\\s*=\\s*(?:\"([^\"]*)\"|([^;]+))", Pattern.CASE_INSENSITIVE);

    private static final String[] USER_AGENTS = {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/121.0.2277.128",
    };

    /** Best-effort content-type -> extension mapping used when the URL has no suffix. */
    private static final Map<String, String> CONTENT_TYPE_EXTENSIONS;

    static {
        Map<String, String> map = new HashMap<>();
        map.put("image/jpeg", "jpg");
        map.put("image/jpg", "jpg");
        map.put("image/png", "png");
        map.put("image/gif", "gif");
        map.put("image/webp", "webp");
        map.put("image/bmp", "bmp");
        map.put("image/svg+xml", "svg");
        map.put("image/tiff", "tiff");
        map.put("application/pdf", "pdf");
        map.put("application/zip", "zip");
        map.put("application/x-zip-compressed", "zip");
        map.put("application/x-7z-compressed", "7z");
        map.put("application/x-rar-compressed", "rar");
        map.put("application/vnd.rar", "rar");
        map.put("application/gzip", "gz");
        map.put("application/x-gzip", "gz");
        map.put("application/x-tar", "tar");
        map.put("application/json", "json");
        map.put("application/xml", "xml");
        map.put("application/msword", "doc");
        map.put("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
        map.put("application/vnd.ms-excel", "xls");
        map.put("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx");
        map.put("application/vnd.ms-powerpoint", "ppt");
        map.put("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx");
        map.put("text/plain", "txt");
        map.put("text/markdown", "md");
        map.put("text/csv", "csv");
        map.put("text/html", "html");
        map.put("application/octet-stream", "bin");
        map.put("audio/mpeg", "mp3");
        map.put("audio/wav", "wav");
        map.put("audio/ogg", "ogg");
        map.put("video/mp4", "mp4");
        map.put("video/webm", "webm");
        map.put("video/quicktime", "mov");
        CONTENT_TYPE_EXTENSIONS = Collections.unmodifiableMap(map);
    }

    private final WebDownloadProperties properties;
    private final Random random = new Random();

    public RemoteFileDownloadService(WebDownloadProperties properties) {
        this.properties = properties;
    }

    /**
     * Download {@code fileUrl} to a temporary file.
     *
     * @param fileUrl          the remote URL (http/https)
     * @param fileNameOverride caller-provided name, or {@code null} to derive one
     * @param checkFirst       HEAD pre-check override, or {@code null} for the
     *                         configured default
     * @return the downloaded file; the caller must {@link DownloadedFile#close()}
     * @throws IOException              on network/HTTP/storage failures
     * @throws IllegalArgumentException when the URL is missing, malformed, uses
     *                                  an unsupported scheme, or is blocked by
     *                                  the SSRF rules
     */
    public DownloadedFile download(String fileUrl, String fileNameOverride, Boolean checkFirst) throws IOException {
        String url = fileUrl == null ? null : fileUrl.trim();
        if (StrUtil.isBlank(url)) {
            throw new IllegalArgumentException("Missing required parameter: fileUrl");
        }
        assertSafeUrl(url);

        boolean headFirst = checkFirst != null ? checkFirst : properties.isHeadCheckEnabled();
        RemoteMetadata metadata = headFirst ? headCheck(url) : RemoteMetadata.EMPTY;
        if (metadata.contentLength > 0 && exceedsMax(metadata.contentLength)) {
            throw new NonRetryableDownloadException(tooLargeMessage(metadata.contentLength));
        }

        int retries = Math.max(0, properties.getRetryCount());
        Exception last = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                return attemptDownload(url, fileNameOverride, metadata);
            } catch (IllegalArgumentException e) {
                // Unsafe URL (possibly after a redirect) — never retry.
                throw e;
            } catch (NonRetryableDownloadException e) {
                throw e;
            } catch (Exception e) {
                last = e;
                if (attempt < retries) {
                    long delay = calculateRetryDelay(attempt);
                    log.warn("Download attempt {}/{} failed for '{}': {}, retrying in {}ms",
                            attempt + 1, retries + 1, url, e.getMessage(), delay);
                    sleep(delay);
                }
            }
        }
        throw new IOException("Failed to download file after " + (retries + 1) + " attempt(s): "
                + (last == null ? "unknown error" : last.getMessage()), last);
    }

    // =========================================================================
    // Single attempt
    // =========================================================================

    private DownloadedFile attemptDownload(String url, String fileNameOverride, RemoteMetadata metadata)
            throws IOException {
        Map<String, HttpCookie> cookieJar = new LinkedHashMap<>();
        HttpResponse response = send("GET", url, cookieJar);
        File temp = null;
        try {
            int status = response.getStatus();
            if (status == 429 || status >= 500) {
                throw new IOException("HTTP " + status + " downloading from URL: " + url);
            }
            if (status >= 400) {
                throw new NonRetryableDownloadException("HTTP " + status + " downloading from URL: " + url);
            }

            String contentType = normalizeContentType(response.header("Content-Type"));
            String dispositionName = parseContentDisposition(response.header("Content-Disposition"));
            String contentLengthHeader = response.header("Content-Length");
            long contentLength = parseLong(contentLengthHeader, metadata.contentLength);
            if (exceedsMax(contentLength)) {
                throw new NonRetryableDownloadException(tooLargeMessage(contentLength));
            }

            String fileName = resolveFileName(fileNameOverride, dispositionName, metadata.fileName, url, contentType);
            temp = createTempFile(fileName);
            long size;
            try (InputStream body = response.bodyStream()) {
                if (body == null) {
                    throw new NonRetryableDownloadException("Empty response body from URL: " + url);
                }
                size = streamToFile(body, temp);
            }
            if (size <= 0) {
                throw new NonRetryableDownloadException("Downloaded file is empty from URL: " + url);
            }
            return new DownloadedFile(temp, size, fileName, contentType, url);
        } catch (IOException e) {
            deleteQuietly(temp);
            throw e;
        } catch (RuntimeException e) {
            deleteQuietly(temp);
            throw e;
        } finally {
            response.close();
        }
    }

    // =========================================================================
    // HTTP: manual redirects + per-download cookies + retry-friendly errors
    // =========================================================================

    private HttpResponse send(String method, String url, Map<String, HttpCookie> cookieJar) throws IOException {
        String current = url;
        int maxRedirects = Math.max(0, properties.getMaxRedirects());
        for (int redirect = 0; ; redirect++) {
            assertSafeUrl(current);
            HttpRequest request = "HEAD".equals(method)
                    ? HttpRequest.head(current)
                    : HttpRequest.get(current);
            applyHeaders(request, current, cookieJar);

            HttpResponse response;
            try {
                response = request.execute();
            } catch (RuntimeException e) {
                // Hutool surfaces connection/timeout failures as unchecked exceptions.
                throw new IOException("HTTP request failed for " + current + ": " + e.getMessage(), e);
            }

            int status = response.getStatus();
            if (status >= 300 && status < 400) {
                String location = response.header("Location");
                collectCookies(response, cookieJar);
                response.close();
                if (StrUtil.isBlank(location)) {
                    throw new IOException("Redirect response without Location header: " + current);
                }
                if (redirect >= maxRedirects) {
                    throw new IOException("Too many redirects (>" + maxRedirects + ") for URL: " + url);
                }
                current = resolveLocation(current, location);
                continue;
            }
            collectCookies(response, cookieJar);
            return response;
        }
    }

    private void applyHeaders(HttpRequest request, String url, Map<String, HttpCookie> cookieJar) {
        request.setFollowRedirects(false);
        request.setMaxRedirectCount(0);
        request.setConnectionTimeout(Math.max(1, properties.getConnectTimeoutSeconds()) * 1000);
        request.setReadTimeout(Math.max(1, properties.getTimeoutSeconds()) * 1000);
        request.header("User-Agent", pickUserAgent());
        request.header("Referer", deriveReferer(url));
        request.header("Accept", "*/*");
        request.header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7");
        request.header("Accept-Encoding", "gzip, deflate");
        request.header("Cache-Control", "no-cache");
        request.header("Pragma", "no-cache");
        if (!cookieJar.isEmpty()) {
            request.cookie(new ArrayList<>(cookieJar.values()));
        }
    }

    private RemoteMetadata headCheck(String url) {
        Map<String, HttpCookie> cookieJar = new LinkedHashMap<>();
        HttpResponse response = null;
        try {
            response = send("HEAD", url, cookieJar);
            if (response.getStatus() >= 400) {
                return RemoteMetadata.EMPTY;
            }
            return new RemoteMetadata(
                    parseContentDisposition(response.header("Content-Disposition")),
                    parseLong(response.header("Content-Length"), -1),
                    normalizeContentType(response.header("Content-Type")));
        } catch (IllegalArgumentException e) {
            // Unsafe URL / blocked redirect — let it fail the download.
            throw e;
        } catch (Exception e) {
            // HEAD is only an optimisation: some servers do not implement it.
            log.debug("HEAD pre-check failed for '{}': {}", url, e.getMessage());
            return RemoteMetadata.EMPTY;
        } finally {
            if (response != null) {
                response.close();
            }
        }
    }

    private static void collectCookies(HttpResponse response, Map<String, HttpCookie> cookieJar) {
        try {
            List<HttpCookie> cookies = response.getCookies();
            if (cookies == null || cookies.isEmpty()) {
                return;
            }
            for (HttpCookie cookie : cookies) {
                if (cookie != null && StrUtil.isNotBlank(cookie.getName())) {
                    cookieJar.put(cookie.getName(), cookie);
                }
            }
        } catch (Exception e) {
            log.debug("Ignoring unreadable Set-Cookie header: {}", e.getMessage());
        }
    }

    private static String resolveLocation(String currentUrl, String location) {
        try {
            return new URL(new URL(currentUrl), location.trim()).toString();
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("Invalid redirect location: " + location);
        }
    }

    // =========================================================================
    // SSRF protection
    // =========================================================================

    /**
     * Reject anything that is not a plain http(s) URL pointing at a public host.
     * Package-private so the rules are directly unit-testable.
     */
    void assertSafeUrl(String url) {
        URL parsed = parseUrl(url);
        String scheme = parsed.getProtocol();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Unsupported URL scheme (only http/https): " + scheme);
        }
        String host = parsed.getHost();
        if (StrUtil.isBlank(host)) {
            throw new IllegalArgumentException("Invalid URL (missing host): " + url);
        }
        if (!properties.isBlockPrivateAddresses() || isAllowedHost(host)) {
            return;
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Cannot resolve host: " + host);
        }
        for (InetAddress address : addresses) {
            if (isPrivateAddress(address)) {
                throw new IllegalArgumentException("Blocked private/loopback address for host: " + host);
            }
        }
    }

    private boolean isAllowedHost(String host) {
        List<String> allowed = properties.getAllowedHosts();
        if (allowed == null || allowed.isEmpty()) {
            return false;
        }
        String lowerHost = host.toLowerCase(Locale.ROOT);
        for (String rule : allowed) {
            if (StrUtil.isBlank(rule)) {
                continue;
            }
            String candidate = rule.trim().toLowerCase(Locale.ROOT);
            if ("*".equals(candidate)) {
                return true;
            }
            if (candidate.startsWith("*.")) {
                candidate = candidate.substring(1);
            }
            if (candidate.startsWith(".")) {
                if (lowerHost.endsWith(candidate)) {
                    return true;
                }
            } else if (lowerHost.equals(candidate)) {
                return true;
            }
        }
        return false;
    }

    /** True for loopback, link-local, site-local, CGNAT, unique-local or multicast. */
    static boolean isPrivateAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            return isPrivateIpv4(bytes);
        }
        if (bytes.length == 16) {
            // IPv6 unique local addresses fc00::/7
            if ((bytes[0] & 0xfe) == 0xfc) {
                return true;
            }
            // IPv4-mapped IPv6 ::ffff:a.b.c.d
            boolean mapped = true;
            for (int i = 0; i < 10; i++) {
                if (bytes[i] != 0) {
                    mapped = false;
                    break;
                }
            }
            if (mapped && (bytes[10] & 0xff) == 0xff && (bytes[11] & 0xff) == 0xff) {
                return isPrivateIpv4(new byte[] { bytes[12], bytes[13], bytes[14], bytes[15] });
            }
        }
        return false;
    }

    private static boolean isPrivateIpv4(byte[] bytes) {
        int first = bytes[0] & 0xff;
        int second = bytes[1] & 0xff;
        if (first == 0 || first == 10 || first == 127) {
            return true; // "this network", private, loopback
        }
        if (first == 169 && second == 254) {
            return true; // link-local, includes cloud metadata 169.254.169.254
        }
        if (first == 172 && second >= 16 && second <= 31) {
            return true; // private
        }
        if (first == 192 && second == 168) {
            return true; // private
        }
        if (first == 100 && second >= 64 && second <= 127) {
            return true; // carrier-grade NAT 100.64/10
        }
        return first >= 224; // multicast, reserved, broadcast
    }

    private static URL parseUrl(String url) {
        if (StrUtil.isBlank(url)) {
            throw new IllegalArgumentException("Missing required parameter: fileUrl");
        }
        try {
            URL parsed = new URL(url);
            if (StrUtil.isBlank(parsed.getHost())) {
                throw new IllegalArgumentException("Invalid URL (missing host): " + url);
            }
            return parsed;
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("Invalid URL format: " + url);
        }
    }

    // =========================================================================
    // File name resolution
    // =========================================================================

    private String resolveFileName(String override, String dispositionName, String headName,
            String url, String contentType) {
        String candidate = firstNonBlank(override, dispositionName, headName, deriveFileNameFromUrl(url));
        String sanitized = sanitizeFileName(candidate);
        return ensureExtension(sanitized, contentType);
    }

    /**
     * Derive a file name from the URL path. Package-private for testing.
     */
    static String deriveFileNameFromUrl(String url) {
        try {
            String path = new URL(url).getPath();
            String name = path.substring(path.lastIndexOf('/') + 1);
            name = urlDecode(name);
            return StrUtil.isBlank(name) ? "downloaded_file" : name;
        } catch (Exception e) {
            return "downloaded_file";
        }
    }

    /**
     * Extract a file name from a {@code Content-Disposition} header, preferring
     * the RFC 5987 {@code filename*} form over {@code filename}.
     * Package-private for testing.
     */
    static String parseContentDisposition(String header) {
        if (StrUtil.isBlank(header)) {
            return null;
        }
        Matcher star = CONTENT_DISPOSITION_STAR.matcher(header);
        if (star.find()) {
            String value = stripQuotes(star.group(1).trim());
            // RFC 5987: charset'language'value — the language is optional.
            int firstQuote = value.indexOf('\'');
            int secondQuote = firstQuote >= 0 ? value.indexOf('\'', firstQuote + 1) : -1;
            if (secondQuote >= 0) {
                value = value.substring(secondQuote + 1);
            }
            String decoded = urlDecode(value);
            if (StrUtil.isNotBlank(decoded)) {
                return decoded;
            }
        }
        Matcher plain = CONTENT_DISPOSITION_PLAIN.matcher(header);
        if (plain.find()) {
            String value = plain.group(1) != null ? plain.group(1) : plain.group(2);
            if (value != null) {
                String trimmed = value.trim();
                if (StrUtil.isNotBlank(trimmed)) {
                    return trimmed;
                }
            }
        }
        return null;
    }

    String sanitizeFileName(String name) {
        String cleaned = StrUtil.isBlank(name) ? "downloaded_file" : name.replace('\\', '/');
        int slash = cleaned.lastIndexOf('/');
        if (slash >= 0) {
            cleaned = cleaned.substring(slash + 1);
        }
        StringBuilder builder = new StringBuilder(cleaned.length());
        for (int i = 0; i < cleaned.length(); i++) {
            char c = cleaned.charAt(i);
            if (c < 0x20 || c == 0x7f) {
                continue;
            }
            if (c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' || c == '/') {
                builder.append('_');
                continue;
            }
            builder.append(c);
        }
        cleaned = builder.toString().trim();
        if (StrUtil.isBlank(cleaned) || ".".equals(cleaned) || "..".equals(cleaned)) {
            cleaned = "downloaded_file";
        }
        int max = properties.getMaxFileNameLength();
        if (max > 0 && cleaned.length() > max) {
            int dot = cleaned.lastIndexOf('.');
            String extension = dot > 0 ? cleaned.substring(dot) : "";
            if (extension.length() >= max) {
                extension = extension.substring(0, max);
            }
            int keep = Math.max(1, max - extension.length());
            cleaned = cleaned.substring(0, keep) + extension;
        }
        return cleaned;
    }

    private static String ensureExtension(String name, String contentType) {
        String resolved = StrUtil.isBlank(name) ? "downloaded_file" : name;
        int dot = resolved.lastIndexOf('.');
        boolean hasExtension = dot > 0 && dot < resolved.length() - 1;
        if (hasExtension) {
            return resolved;
        }
        String extension = extensionForContentType(contentType);
        return StrUtil.isBlank(extension) ? resolved : resolved + "." + extension;
    }

    /**
     * Map a content type to a file extension. Package-private for testing.
     */
    static String extensionForContentType(String contentType) {
        String normalized = normalizeContentType(contentType);
        return normalized == null ? null : CONTENT_TYPE_EXTENSIONS.get(normalized);
    }

    static String normalizeContentType(String contentType) {
        if (StrUtil.isBlank(contentType)) {
            return null;
        }
        int separator = contentType.indexOf(';');
        String value = (separator >= 0 ? contentType.substring(0, separator) : contentType).trim();
        return value.isEmpty() ? null : value.toLowerCase(Locale.ROOT);
    }

    private static String urlDecode(String value) {
        if (value == null) {
            return null;
        }
        try {
            // URLDecoder treats '+' as a space; in paths and RFC 5987 values a
            // literal '+' must survive.
            return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return value;
        }
    }

    private static String stripQuotes(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    // =========================================================================
    // Streaming + temp files
    // =========================================================================

    private long streamToFile(InputStream input, File target) throws IOException {
        long maxSize = properties.getMaxDownloadSize();
        long written = 0L;
        byte[] buffer = new byte[BUFFER_SIZE];
        try (OutputStream output = new FileOutputStream(target)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read == 0) {
                    continue;
                }
                written += read;
                if (maxSize > 0 && written > maxSize) {
                    throw new NonRetryableDownloadException(tooLargeMessage(written));
                }
                output.write(buffer, 0, read);
            }
        }
        return written;
    }

    private File createTempFile(String fileName) throws IOException {
        String suffix = "";
        int dot = fileName.lastIndexOf('.');
        if (dot >= 0 && dot < fileName.length() - 1) {
            suffix = fileName.substring(dot);
            if (suffix.length() > MAX_SUFFIX_LENGTH) {
                suffix = suffix.substring(0, MAX_SUFFIX_LENGTH);
            }
        }
        String tempDir = properties.getTempDir();
        if (StrUtil.isNotBlank(tempDir)) {
            File dir = new File(tempDir);
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IOException("Cannot create temp directory: " + tempDir);
            }
            return File.createTempFile("knowledge-download-", suffix, dir);
        }
        return File.createTempFile("knowledge-download-", suffix);
    }

    private static void deleteQuietly(File file) {
        if (file != null && file.exists() && !file.delete()) {
            log.warn("Failed to delete temporary download file: {}", file.getAbsolutePath());
        }
    }

    // =========================================================================
    // Misc helpers
    // =========================================================================

    private String pickUserAgent() {
        // Rotation is an anti-bot measure; the configured UA is the fallback
        // when it is disabled.
        if (!properties.isUserAgentRotation()) {
            return properties.getUserAgent();
        }
        return USER_AGENTS[random.nextInt(USER_AGENTS.length)];
    }

    private static String deriveReferer(String url) {
        try {
            URL parsed = new URL(url);
            return parsed.getProtocol() + "://" + parsed.getHost() + "/";
        } catch (Exception e) {
            return "";
        }
    }

    private long calculateRetryDelay(int attempt) {
        long delay = RETRY_BASE_DELAY_MS * (1L << Math.min(attempt, 10));
        return delay + random.nextInt(RETRY_MAX_JITTER_MS);
    }

    private static void sleep(long millis) throws IOException {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Download interrupted", e);
        }
    }

    private boolean exceedsMax(long size) {
        return size > 0 && properties.getMaxDownloadSize() > 0 && size > properties.getMaxDownloadSize();
    }

    private String tooLargeMessage(long size) {
        return "Remote file size (" + formatSize(size) + ") exceeds the maximum allowed size ("
                + formatSize(properties.getMaxDownloadSize()) + ")";
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (StrUtil.isNotBlank(value)) {
                return value;
            }
        }
        return null;
    }

    private static long parseLong(String value, long fallback) {
        if (StrUtil.isBlank(value)) {
            return fallback;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    static String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024L * 1024) {
            return String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0);
        }
        if (bytes < 1024L * 1024 * 1024) {
            return String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024));
        }
        return String.format(Locale.ROOT, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }

    // =========================================================================
    // Value types
    // =========================================================================

    /** Metadata gathered from the optional HEAD pre-check. */
    private static final class RemoteMetadata {
        private static final RemoteMetadata EMPTY = new RemoteMetadata(null, -1, null);

        private final String fileName;
        private final long contentLength;
        @SuppressWarnings("unused")
        private final String contentType;

        private RemoteMetadata(String fileName, long contentLength, String contentType) {
            this.fileName = fileName;
            this.contentLength = contentLength;
            this.contentType = contentType;
        }
    }

    /** Non-retryable failure (HTTP 4xx except 429, size cap, empty body). */
    public static class NonRetryableDownloadException extends IOException {
        public NonRetryableDownloadException(String message) {
            super(message);
        }
    }

    /**
     * A downloaded file backed by a temporary file. Close it to delete the file.
     */
    public static final class DownloadedFile implements Closeable {
        private final File file;
        private final long size;
        private final String fileName;
        private final String contentType;
        private final String sourceUrl;

        public DownloadedFile(File file, long size, String fileName, String contentType, String sourceUrl) {
            this.file = file;
            this.size = size;
            this.fileName = fileName;
            this.contentType = contentType;
            this.sourceUrl = sourceUrl;
        }

        public File getFile() {
            return file;
        }

        public long getSize() {
            return size;
        }

        public String getFileName() {
            return fileName;
        }

        public String getContentType() {
            return contentType;
        }

        public String getSourceUrl() {
            return sourceUrl;
        }

        @Override
        public void close() {
            deleteQuietly(file);
        }
    }
}
