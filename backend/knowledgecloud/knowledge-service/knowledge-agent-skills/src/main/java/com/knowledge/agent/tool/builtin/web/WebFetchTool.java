package com.knowledge.agent.tool.builtin.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.*;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Tool for fetching URL content and extracting readable text.
 * Uses Jsoup for HTML parsing and content extraction.
 * Supports text and markdown output formats.
 */
@Slf4j
@Component
public class WebFetchTool implements Tool {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    private static final Pattern URL_PATTERN = Pattern.compile("^https?://.*", Pattern.CASE_INSENSITIVE);
    /** Maximum content length to return (characters). */
    private static final int MAX_CONTENT_LENGTH = 50000;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.skill.web-fetch.timeout-seconds:15}")
    private int timeoutSeconds;

    @Value("${agent.skill.web-fetch.max-content-length:50000}")
    private int maxContentLength;

    @Override
    public String getId() {
        return "web_fetch";
    }

    @Override
    public String getDescription() {
        return "Fetch and extract text content from a URL. Returns the page title and main text content.";
    }

    @Override
    public String getJsonSchema() {
        return ToolDefinition.objectSchema(
                new LinkedHashMap<String, ToolDefinition.PropertyDef>() {
                    {
                        put("url", ToolDefinition.PropertyDef.string("The URL to fetch"));
                        put("format", ToolDefinition.PropertyDef.string("Output format: text or markdown", "text",
                                "markdown"));
                    }
                },
                Collections.singletonList("url"));
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        log.info("WebFetchTool called with args: {}", args);

        try {
            JsonNode root = objectMapper.readTree(args);
            String url = root.has("url") ? root.get("url").asText() : null;
            if (StrUtil.isBlank(url)) {
                return ToolResult.error("Missing required parameter: url");
            }
            if (!URL_PATTERN.matcher(url).matches()) {
                return ToolResult.error("Invalid URL format. URL must start with http:// or https://");
            }

            String format = root.has("format") ? root.get("format").asText("text") : "text";

            // Fetch the page HTML
            String html = fetchHtml(url);
            if (StrUtil.isBlank(html)) {
                return ToolResult.error("Failed to fetch content from URL: " + url);
            }

            // Parse with Jsoup
            Document doc = Jsoup.parse(html, url);

            // Remove non-content elements
            doc.select("script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .advertisement, "
                    + "#cookie-banner, .cookie-notice, .popup, .modal").remove();

            String title = doc.title();
            String content;

            if ("markdown".equalsIgnoreCase(format)) {
                content = extractMarkdown(doc);
            } else {
                content = extractText(doc);
            }

            // Truncate if too long
            int limit = maxContentLength > 0 ? maxContentLength : MAX_CONTENT_LENGTH;
            boolean truncated = false;
            if (content.length() > limit) {
                content = content.substring(0, limit);
                truncated = true;
            }

            // Build output
            StringBuilder sb = new StringBuilder();
            sb.append("# ").append(StrUtil.isNotBlank(title) ? title : "(No title)").append("\n");
            sb.append("**URL:** ").append(url).append("\n\n");
            sb.append(content);
            if (truncated) {
                sb.append("\n\n---\n*Content truncated at ").append(limit).append(" characters.*");
            }

            log.info("WebFetchTool extracted {} chars from: {}", content.length(), url);
            return ToolResult.success(sb.toString());

        } catch (Exception e) {
            log.error("WebFetchTool error: {}", e.getMessage(), e);
            return ToolResult.error("Failed to fetch URL: " + e.getMessage());
        }
    }

    // =========================================================================
    // HTTP fetch
    // =========================================================================

    private String fetchHtml(String url) {
        try {
            String referer = deriveReferer(url);
            try (HttpResponse response = HttpRequest.get(url)
                    .header("User-Agent", USER_AGENT)
                    .header("Referer", referer)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
                    .header("Accept-Encoding", "gzip, deflate")
                    .timeout(timeoutSeconds * 1000)
                    .setFollowRedirects(true)
                    .execute()) {

                if (!response.isOk()) {
                    log.warn("HTTP {} fetching URL: {}", response.getStatus(), url);
                    return null;
                }
                return response.body();
            }
        } catch (Exception e) {
            log.error("Failed to fetch URL '{}': {}", url, e.getMessage());
            return null;
        }
    }

    private String deriveReferer(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            return u.getProtocol() + "://" + u.getHost() + "/";
        } catch (Exception e) {
            return "";
        }
    }

    // =========================================================================
    // Text extraction
    // =========================================================================

    /**
     * Extract plain text from the HTML document.
     * Tries to find the main content area first; falls back to full body.
     */
    private String extractText(Document doc) {
        // Try to find main content element
        Element mainContent = findMainContent(doc);
        String text;
        if (mainContent != null) {
            text = mainContent.text();
        } else {
            text = doc.body() != null ? doc.body().text() : doc.text();
        }
        // Normalize whitespace
        return text.replaceAll("\\s{3,}", "\n\n").trim();
    }

    /**
     * Extract content in a markdown-like format preserving structure.
     */
    private String extractMarkdown(Document doc) {
        Element mainContent = findMainContent(doc);
        Element root = mainContent != null ? mainContent : (doc.body() != null ? doc.body() : doc);

        StringBuilder md = new StringBuilder();
        convertToMarkdown(root, md);
        // Clean up excessive blank lines
        String result = md.toString().replaceAll("\n{3,}", "\n\n").trim();
        return result;
    }

    /**
     * Find the main content element by trying common selectors.
     */
    private Element findMainContent(Document doc) {
        // Try common content selectors in priority order
        String[] selectors = {
                "article", "[role=main]", "main",
                ".post-content", ".article-content", ".entry-content",
                ".content", "#content", "#main-content",
                ".page-content", ".post-body"
        };
        for (String selector : selectors) {
            Elements elements = doc.select(selector);
            if (!elements.isEmpty()) {
                Element el = elements.first();
                // Only use if it has meaningful text (> 100 chars)
                if (el.text().length() > 100) {
                    return el;
                }
            }
        }
        return null;
    }

    /**
     * Recursively convert HTML elements to markdown-like text.
     */
    private void convertToMarkdown(Element element, StringBuilder md) {
        for (org.jsoup.nodes.Node child : element.childNodes()) {
            if (child instanceof org.jsoup.nodes.TextNode) {
                String text = ((org.jsoup.nodes.TextNode) child).getWholeText().trim();
                if (!text.isEmpty()) {
                    md.append(text).append(" ");
                }
            } else if (child instanceof Element) {
                Element el = (Element) child;
                String tag = el.tagName().toLowerCase();

                switch (tag) {
                    case "h1":
                        md.append("\n\n# ").append(el.text()).append("\n\n");
                        break;
                    case "h2":
                        md.append("\n\n## ").append(el.text()).append("\n\n");
                        break;
                    case "h3":
                        md.append("\n\n### ").append(el.text()).append("\n\n");
                        break;
                    case "h4":
                        md.append("\n\n#### ").append(el.text()).append("\n\n");
                        break;
                    case "h5":
                    case "h6":
                        md.append("\n\n##### ").append(el.text()).append("\n\n");
                        break;
                    case "p":
                        md.append("\n\n");
                        convertToMarkdown(el, md);
                        md.append("\n\n");
                        break;
                    case "br":
                        md.append("\n");
                        break;
                    case "strong":
                    case "b":
                        md.append("**").append(el.text()).append("**");
                        break;
                    case "em":
                    case "i":
                        md.append("*").append(el.text()).append("*");
                        break;
                    case "a":
                        String href = el.attr("abs:href");
                        String linkText = el.text();
                        if (StrUtil.isNotBlank(href) && StrUtil.isNotBlank(linkText)) {
                            md.append("[").append(linkText).append("](").append(href).append(")");
                        } else if (StrUtil.isNotBlank(linkText)) {
                            md.append(linkText);
                        }
                        break;
                    case "img":
                        String src = el.attr("abs:src");
                        String alt = el.attr("alt");
                        if (StrUtil.isNotBlank(src)) {
                            md.append("![").append(alt != null ? alt : "").append("](").append(src).append(")");
                        }
                        break;
                    case "ul":
                    case "ol":
                        md.append("\n");
                        Elements items = el.children();
                        for (int i = 0; i < items.size(); i++) {
                            Element li = items.get(i);
                            if ("ol".equals(tag)) {
                                md.append(i + 1).append(". ");
                            } else {
                                md.append("- ");
                            }
                            md.append(li.text()).append("\n");
                        }
                        md.append("\n");
                        break;
                    case "blockquote":
                        md.append("\n> ").append(el.text()).append("\n\n");
                        break;
                    case "code":
                        md.append("`").append(el.text()).append("`");
                        break;
                    case "pre":
                        md.append("\n```\n").append(el.text()).append("\n```\n\n");
                        break;
                    case "table":
                        convertTable(el, md);
                        break;
                    case "hr":
                        md.append("\n---\n\n");
                        break;
                    case "div":
                    case "section":
                    case "span":
                    case "figure":
                    case "figcaption":
                        convertToMarkdown(el, md);
                        break;
                    default:
                        // For other elements, just recurse
                        convertToMarkdown(el, md);
                        break;
                }
            }
        }
    }

    /**
     * Convert an HTML table to markdown table format.
     */
    private void convertTable(Element table, StringBuilder md) {
        md.append("\n");
        Elements rows = table.select("tr");
        boolean headerDone = false;

        for (Element row : rows) {
            Elements cells = row.select("th, td");
            if (cells.isEmpty())
                continue;

            md.append("|");
            for (Element cell : cells) {
                md.append(" ").append(cell.text()).append(" |");
            }
            md.append("\n");

            // Add separator after header row
            if (!headerDone && !row.select("th").isEmpty()) {
                md.append("|");
                for (int i = 0; i < cells.size(); i++) {
                    md.append(" --- |");
                }
                md.append("\n");
                headerDone = true;
            }
        }
        md.append("\n");
    }
}
