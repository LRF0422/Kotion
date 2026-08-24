package com.knowledge.wiki.service.skill;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTierValue;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.doc.BlockDocCodec;
import com.knowledge.wiki.service.doc.PageDocCommandService;
import com.knowledge.wiki.service.doc.PageDocService;
import com.knowledge.wiki.service.doc.WikiBlockReadService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceService;

import com.knowledge.wiki.service.entity.enums.SpaceStatus;
import com.knowledge.wiki.service.entity.enums.SpaceType;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import lombok.extern.slf4j.Slf4j;

/**
 * Wiki Page Operations skill using annotation-based registration.
 * <p>
 * This skill provides wiki page operations including:
 * <ul>
 * <li><b>querySpaces</b> - Query and filter existing spaces in the knowledge
 * base</li>
 * <li><b>summarizePage</b> - Get page content for summarization</li>
 * <li><b>getSpacePages</b> - List and summarize all pages in a space</li>
 * <li><b>searchContent</b> - Search pages/blocks by keyword</li>
 * <li><b>getBlockDetail</b> - Get specific block details</li>
 * </ul>
 */
@Slf4j
@AgentSkill(id = "wiki-page", name = "Wiki Page Operations", description = "Perform wiki page operations including: query and filter existing spaces by name/type, summarize a page's content, "
        +
        "fetch and summarize all pages from a space, search pages/blocks by keyword, " +
        "get specific block details, and create or update page content. Use this skill to retrieve, analyze, and modify knowledge base content.", version = "1.0.0", author = "KnowledgeCloud", tier = SkillTierValue.DOMAIN, categories = {
                "wiki", "knowledge-base", "content-retrieval", "content-creation" })
public class WikiPageSkill {

    /** Maximum content length per page in characters */
    private static final int MAX_CONTENT_LENGTH = 5000;

    /** Maximum pages to fetch from a space */
    private static final int MAX_PAGES_PER_SPACE = 50;

    /** Maximum search results to return */
    private static final int MAX_SEARCH_RESULTS = 20;

    @Autowired
    private IPageService pageService;

    @Autowired
    private ISpaceService spaceService;

    @Autowired
    private WikiBlockReadService wikiBlockReadService;

    @Autowired
    private PageDocService pageDocService;

    @Autowired
    private PageDocCommandService pageDocCommandService;

    @Autowired
    private IPermissionService permissionService;

    /**
     * Summarize a page's content.
     *
     * @param pageId the page ID to summarize
     * @return formatted page content for LLM consumption
     */
    @SkillTool(name = "summarize_page", description = "Get page content for summarization. Returns the page title, description, and full content as readable text.")
    public String summarizePage(
            @ToolParam(name = "pageId", description = "The page ID to summarize", type = "number", required = true) Long pageId) {
        if (pageId == null) {
            return "Error: Missing required parameter: pageId";
        }

        log.info("Summarizing page with id={}", pageId);

        try {
            Page page = pageService.getById(pageId);
            if (page == null) {
                return "Error: Page not found with id=" + pageId;
            }
            permissionService.checkPagePermission(SecurityContextUtil.getUserId(), page,
                    IPermissionService.PERMISSION_READ);

            StringBuilder result = new StringBuilder();
            result.append("# Page: ").append(page.getTitle()).append("\n\n");

            if (StrUtil.isNotBlank(page.getDescription())) {
                result.append("**Description:** ").append(page.getDescription()).append("\n\n");
            }

            if (page.getSpaceId() != null) {
                result.append("**Space ID:** ").append(page.getSpaceId()).append("\n");
            }
            result.append("**Page ID:** ").append(pageId).append("\n\n");

            result.append("## Content\n\n");

            Map<String, Object> doc = pageDocService.readDoc(pageId).getDoc();
            String textContent = truncateContent(BlockDocCodec.extractText(doc), MAX_CONTENT_LENGTH);
            result.append(StrUtil.isNotBlank(textContent) ? textContent : "(No content available)\n");

            log.info("Successfully summarized page id={}, title='{}'", pageId, page.getTitle());
            return result.toString();
        } catch (Exception e) {
            log.error("Error summarizing page id={}", pageId, e);
            return "Error summarizing page: " + e.getMessage();
        }
    }

    /**
     * Query existing spaces in the knowledge base with optional filtering.
     * <p>
     * By default, only ACTIVE spaces are returned, and system spaces (INNER,
     * TEMPLATE) are excluded.
     *
     * @param keyword   optional keyword to filter spaces by name
     * @param spaceType optional space type filter (PERSONAL, SPACE, COLLABORATION,
     *                  JOURNAL)
     * @return formatted list of spaces for LLM consumption
     */
    @SkillTool(name = "query_spaces", description = "Query existing spaces in the knowledge base with optional filtering. "
            +
            "Supports filtering by name keyword and space type. Returns space ID, name, type, status, description, and creation time. "
            +
            "By default only shows ACTIVE user spaces (excludes system/template spaces).")
    public String querySpaces(
            @ToolParam(name = "keyword", description = "Optional keyword to filter spaces by name (case-insensitive partial match)", type = "string", required = false) String keyword,
            @ToolParam(name = "spaceType", description = "Optional space type filter. Valid values: PERSONAL (personal space), SPACE (normal space), COLLABORATION (collaboration space), JOURNAL (journal space). Leave empty to include all user space types.", type = "string", required = false) String spaceType) {
        log.info("Querying spaces with keyword='{}', spaceType='{}'", keyword, spaceType);

        try {
            // Parse space type if provided
            SpaceType typeFilter = null;
            if (StrUtil.isNotBlank(spaceType)) {
                try {
                    typeFilter = SpaceType.valueOf(spaceType.toUpperCase());
                    // Validate that the type is not a system type
                    if (typeFilter == SpaceType.INNER || typeFilter == SpaceType.TEMPALTE) {
                        return "Error: Cannot query system spaces (INNER or TEMPLATE). Please use a valid user space type: PERSONAL, SPACE, COLLABORATION, or JOURNAL.";
                    }
                } catch (IllegalArgumentException e) {
                    return "Error: Invalid space type '" + spaceType
                            + "'. Valid values are: PERSONAL, SPACE, COLLABORATION, JOURNAL.";
                }
            }

            // Build query: only ACTIVE spaces, exclude INNER and TEMPLATE types
            final SpaceType finalTypeFilter = typeFilter;
            List<Space> spaces = spaceService.lambdaQuery()
                    .eq(Space::getStatus, SpaceStatus.ACTIVE)
                    .notIn(Space::getType, SpaceType.INNER, SpaceType.TEMPALTE)
                    .eq(finalTypeFilter != null, Space::getType, finalTypeFilter)
                    .like(StrUtil.isNotBlank(keyword), Space::getName, keyword)
                    .orderByDesc(Space::getCreateTime)
                    .last("LIMIT 50")
                    .list();

            StringBuilder result = new StringBuilder();
            result.append("# Available Spaces\n\n");

            if (CollUtil.isEmpty(spaces)) {
                result.append("No spaces found");
                if (StrUtil.isNotBlank(keyword) || finalTypeFilter != null) {
                    result.append(" matching the criteria:");
                    if (StrUtil.isNotBlank(keyword)) {
                        result.append(" keyword=\"").append(keyword).append("\"");
                    }
                    if (finalTypeFilter != null) {
                        result.append(" type=").append(finalTypeFilter.name());
                    }
                }
                result.append(".\n");
                return result.toString();
            }

            result.append("**Total:** ").append(spaces.size()).append(" space(s)");
            if (spaces.size() >= 50) {
                result.append(" (showing first 50)");
            }
            result.append("\n\n");

            // Display filter criteria if any
            if (StrUtil.isNotBlank(keyword) || finalTypeFilter != null) {
                result.append("**Filters:** ");
                if (StrUtil.isNotBlank(keyword)) {
                    result.append("name contains \"").append(keyword).append("\"");
                    if (finalTypeFilter != null) {
                        result.append(", ");
                    }
                }
                if (finalTypeFilter != null) {
                    result.append("type=").append(finalTypeFilter.name());
                }
                result.append("\n\n");
            }

            for (int i = 0; i < spaces.size(); i++) {
                Space space = spaces.get(i);
                String spaceName = space.getName() != null ? space.getName() : "Unnamed Space";
                String spaceDesc = space.getDescription();
                String typeStr = space.getType() != null ? space.getType().name() : "UNKNOWN";
                String statusStr = space.getStatus() != null ? space.getStatus().name() : "UNKNOWN";
                String createTime = space.getCreateTime() != null ? space.getCreateTime().toString() : "N/A";

                result.append(i + 1).append(". **").append(spaceName).append("**\n");
                result.append("   - Space ID: ").append(space.getId()).append("\n");
                result.append("   - Type: ").append(typeStr).append("\n");
                result.append("   - Status: ").append(statusStr).append("\n");
                result.append("   - Created: ").append(createTime).append("\n");
                if (StrUtil.isNotBlank(spaceDesc)) {
                    result.append("   - Description: ").append(truncateContent(spaceDesc, 150)).append("\n");
                }
                result.append("\n");
            }

            log.info("Successfully queried {} spaces with keyword='{}', type='{}'", spaces.size(), keyword, spaceType);
            return result.toString();
        } catch (Exception e) {
            log.error("Error querying spaces with keyword='{}', spaceType='{}'", keyword, spaceType, e);
            return "Error querying spaces: " + e.getMessage();
        }
    }

    /**
     * Get all pages from a space.
     *
     * @param spaceId the space ID
     * @return formatted list of pages in the space
     */
    @SkillTool(name = "get_space_pages", description = "List and summarize all pages in a space. Returns space details and a list of all pages with their IDs, titles, and descriptions.")
    public String getSpacePages(
            @ToolParam(name = "spaceId", description = "The space ID to list pages from", type = "number", required = true) Long spaceId) {
        if (spaceId == null) {
            return "Error: Missing required parameter: spaceId";
        }

        log.info("Fetching pages for space id={}", spaceId);

        try {
            // Get space details
            Space space = spaceService.getById(spaceId);
            String spaceName = space != null ? space.getName() : "Unknown Space";

            // Get pages in the space
            List<Page> pages = pageService.getBySpaceId(spaceId);

            StringBuilder result = new StringBuilder();
            result.append("# Space: ").append(spaceName).append("\n");
            result.append("**Space ID:** ").append(spaceId).append("\n\n");

            if (CollUtil.isEmpty(pages)) {
                result.append("No pages found in this space.\n");
                return result.toString();
            }

            int totalPages = pages.size();
            int displayCount = Math.min(totalPages, MAX_PAGES_PER_SPACE);

            result.append("**Total Pages:** ").append(totalPages).append("\n\n");
            result.append("## Pages\n\n");

            for (int i = 0; i < displayCount; i++) {
                Page page = pages.get(i);
                String pageTitle = page.getTitle() != null ? page.getTitle() : "Untitled";
                String pageDesc = page.getDescription();

                result.append(i + 1).append(". **").append(pageTitle).append("**\n");
                result.append("   - Page ID: ").append(page.getId()).append("\n");
                if (StrUtil.isNotBlank(pageDesc)) {
                    result.append("   - Description: ").append(truncateContent(pageDesc, 150)).append("\n");
                }
                result.append("\n");
            }

            if (totalPages > displayCount) {
                result.append("\n... and ").append(totalPages - displayCount).append(" more pages.\n");
            }

            log.info("Successfully listed {} pages for space id={}", displayCount, spaceId);
            return result.toString();
        } catch (Exception e) {
            log.error("Error fetching pages for space id={}", spaceId, e);
            return "Error fetching space pages: " + e.getMessage();
        }
    }

    /**
     * Search pages/blocks by keyword.
     *
     * @param keyword the search keyword (required)
     * @param spaceId optional space ID to narrow search scope
     * @param pageId  optional page ID to narrow search scope
     * @return formatted search results
     */
    @SkillTool(name = "search_content", description = "Search pages and blocks by keyword. Returns matching blocks with their page context, space info, and content snippets.")
    public String searchContent(
            @ToolParam(name = "keyword", description = "The keyword to search for", type = "string", required = true) String keyword,
            @ToolParam(name = "spaceId", description = "Optional space ID to narrow search scope", type = "number", required = false) Long spaceId,
            @ToolParam(name = "pageId", description = "Optional page ID to narrow search scope", type = "number", required = false) Long pageId) {
        if (StrUtil.isBlank(keyword)) {
            return "Error: Missing required parameter: keyword";
        }

        log.info("Searching for keyword='{}', spaceId={}, pageId={}", keyword, spaceId, pageId);

        try {
            List<PageBlockDetailVO> blocks = wikiBlockReadService.search(keyword, pageId, spaceId,
                    MAX_SEARCH_RESULTS);

            StringBuilder result = new StringBuilder();
            result.append("# Search Results for: \"").append(keyword).append("\"\n\n");

            if (CollUtil.isEmpty(blocks)) {
                result.append("No results found for the given keyword.\n");
                return result.toString();
            }

            int maxResults = Math.min(blocks.size(), MAX_SEARCH_RESULTS);
            result.append("**Found:** ").append(blocks.size()).append(" results");
            result.append("\n\n");

            for (int i = 0; i < maxResults; i++) {
                PageBlockDetailVO block = blocks.get(i);
                String blockId = block.getId() != null ? block.getId() : "";
                String pageTitle = block.getPageTitle() != null ? block.getPageTitle() : "Unknown Page";
                String spaceName = block.getSpaceName();
                String blockType = block.getType() != null ? block.getType() : "";
                String blockText = block.getText() != null ? block.getText() : "";

                result.append("## Result ").append(i + 1).append("\n");
                result.append("- **Page:** ").append(pageTitle).append("\n");
                if (StrUtil.isNotBlank(spaceName)) {
                    result.append("- **Space:** ").append(spaceName).append("\n");
                }
                result.append("- **Block ID:** ").append(blockId).append("\n");
                if (StrUtil.isNotBlank(blockType)) {
                    result.append("- **Block Type:** ").append(blockType).append("\n");
                }
                result.append("- **Content:** ").append(truncateContent(blockText, 300)).append("\n\n");
            }

            log.info("Search for '{}' returned {} results", keyword, blocks.size());
            return result.toString();
        } catch (Exception e) {
            log.error("Error searching for keyword='{}'", keyword, e);
            return "Error searching content: " + e.getMessage();
        }
    }

    /**
     * Write or update a page's content.
     *
     * @param title   the page title (required)
     * @param content the page content in plain text or markdown format (required)
     * @param spaceId the space ID where the page belongs (required for new pages)
     * @param pageId  the existing page ID to update (null to create a new page)
     * @return formatted result of the write operation
     */
    @SkillTool(name = "write_page", description = "Create a new page or update an existing page's content. " +
            "To create a new page, provide title, content, and spaceId. " +
            "To update an existing page, provide pageId along with the new title and/or content. " +
            "When updating, omit title or content to keep the existing value unchanged.")
    public String writePage(
            @ToolParam(name = "title", description = "The page title (required for new pages; omit to keep existing title when updating)", type = "string", required = false) String title,
            @ToolParam(name = "content", description = "The page content in plain text or markdown format (required for new pages; omit to keep existing content when updating)", type = "string", required = false) String content,
            @ToolParam(name = "spaceId", description = "The space ID where the page belongs (required when creating a new page)", type = "number", required = false) Long spaceId,
            @ToolParam(name = "pageId", description = "The existing page ID to update (omit to create a new page)", type = "number", required = false) Long pageId) {
        log.info("Writing page: pageId={}, title='{}', spaceId={}", pageId, title, spaceId);

        try {
            Long actor = SecurityContextUtil.getUserId();
            Page savedPage;
            boolean isNew = pageId == null;

            if (!isNew) {
                Page current = pageService.getById(pageId);
                if (current == null) {
                    return "Error: Page not found with id=" + pageId;
                }
                permissionService.checkPagePermission(actor, current, IPermissionService.PERMISSION_WRITE);

                PageDocVO currentDoc = pageDocService.readDoc(pageId);
                Map<String, Object> doc;
                if (StrUtil.isNotBlank(content)) {
                    String effectiveTitle = StrUtil.isNotBlank(title) ? title : current.getTitle();
                    doc = convertToPageDocument(effectiveTitle, content);
                } else {
                    doc = BlockDocCodec.readJson(BlockDocCodec.writeJson(currentDoc.getDoc()));
                    if (doc == null) {
                        return "Error: Existing page document is invalid";
                    }
                    if (StrUtil.isNotBlank(title)) {
                        replaceDocumentTitle(doc, title);
                    }
                }
                pageDocCommandService.reconcileTrusted(pageId, doc, actor, currentDoc.getRev());
                savedPage = pageService.getById(pageId);
            } else {
                if (spaceId == null) {
                    return "Error: spaceId is required when creating a new page";
                }
                if (StrUtil.isBlank(title)) {
                    return "Error: title is required when creating a new page";
                }
                if (StrUtil.isBlank(content)) {
                    return "Error: content is required when creating a new page";
                }

                Space space = spaceService.getById(spaceId);
                if (space == null) {
                    return "Error: Space not found with id=" + spaceId;
                }
                String spacePermission = permissionService.effectiveSpacePermission(actor, space);
                if (!IPermissionService.PERMISSION_WRITE.equals(spacePermission)
                        && !IPermissionService.PERMISSION_ADMIN.equals(spacePermission)) {
                    return "Error: Write permission is required for space id=" + spaceId;
                }

                Page page = new Page();
                page.setTitle(title);
                page.setContent(BlockDocCodec.writeJson(convertToPageDocument(title, content)));
                page.setSpaceId(spaceId);
                page.setParentId(Page.TOP_PAGE_ID);
                savedPage = pageService.createPage(page, true);
            }

            StringBuilder result = new StringBuilder();
            result.append(isNew ? "# Page Created" : "# Page Updated").append("\n\n");
            result.append("**Page ID:** ").append(savedPage.getId()).append("\n");
            result.append("**Title:** ").append(savedPage.getTitle()).append("\n");
            if (savedPage.getSpaceId() != null) {
                result.append("**Space ID:** ").append(savedPage.getSpaceId()).append("\n");
            }
            result.append("**Status:** Successfully ").append(isNew ? "created" : "updated").append("\n");

            log.info("Successfully {} page id={}, title='{}'", isNew ? "created" : "updated", savedPage.getId(),
                    savedPage.getTitle());
            return result.toString();
        } catch (Exception e) {
            log.error("Error writing page: pageId={}, title='{}'", pageId, title, e);
            return "Error writing page: " + e.getMessage();
        }
    }

    /**
     * Get detailed information about a specific block.
     *
     * @param blockId the block ID
     * @return formatted block details
     */
    @SkillTool(name = "get_block_detail", description = "Get detailed information about a specific block including its content, type, path, and page context.")
    public String getBlockDetail(
            @ToolParam(name = "blockId", description = "The block ID to get details for", type = "string", required = true) String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return "Error: Missing required parameter: blockId";
        }

        log.info("Getting block detail for blockId={}", blockId);

        try {
            PageBlockDetailVO blockData = wikiBlockReadService.getBlockDetail(blockId);
            if (blockData == null) {
                return "Error: Block not found with id=" + blockId;
            }

            String pageTitle = StrUtil.blankToDefault(blockData.getPageTitle(), "Unknown Page");
            String spaceName = blockData.getSpaceName();
            String blockType = blockData.getType() != null ? blockData.getType() : "";
            String blockText = blockData.getText();
            String path = blockData.getFullPath();

            StringBuilder result = new StringBuilder();
            result.append("# Block Detail\n\n");
            result.append("**Block ID:** ").append(blockId).append("\n");
            result.append("**Page:** ").append(pageTitle).append("\n");
            if (StrUtil.isNotBlank(spaceName)) {
                result.append("**Space:** ").append(spaceName).append("\n");
            }
            if (StrUtil.isNotBlank(blockType)) {
                result.append("**Type:** ").append(blockType).append("\n");
            }
            if (StrUtil.isNotBlank(path)) {
                result.append("**Path:** ").append(path).append("\n");
            }
            result.append("\n## Content\n\n");

            // The detail VO carries the complete ProseMirror node from wiki_block.node.
            if (blockData.getContent() != null) {
                String extractedContent = extractTextFromContent(blockData.getContent());
                result.append(truncateContent(extractedContent, MAX_CONTENT_LENGTH));
            } else if (StrUtil.isNotBlank(blockText)) {
                result.append(truncateContent(blockText, MAX_CONTENT_LENGTH));
            } else {
                result.append("(No content available)\n");
            }

            log.info("Successfully retrieved block detail for blockId={}", blockId);
            return result.toString();
        } catch (Exception e) {
            log.error("Error getting block detail for blockId={}", blockId, e);
            return "Error getting block detail: " + e.getMessage();
        }
    }

    // -------------------------------------------------------------------------
    // Helper methods
    // -------------------------------------------------------------------------

    /**
     * Recursively extract readable text from wiki block content structure.
     * Handles the nested block tree with type, text, content (children), attrs,
     * marks.
     */
    @SuppressWarnings("unchecked")
    private String extractTextFromContent(Object content) {
        if (content == null) {
            return "";
        }

        StringBuilder text = new StringBuilder();

        if (content instanceof Map || content instanceof JSONObject) {
            Map<String, Object> block;
            if (content instanceof JSONObject) {
                block = (JSONObject) content;
            } else {
                block = (Map<String, Object>) content;
            }

            String type = getStringFromMap(block, "type", "");

            // Handle different block types
            if ("heading".equals(type)) {
                Object attrs = block.get("attrs");
                int level = 1;
                if (attrs instanceof Map) {
                    Object levelObj = ((Map<String, Object>) attrs).get("level");
                    if (levelObj instanceof Number) {
                        level = ((Number) levelObj).intValue();
                    }
                }
                // Add markdown heading prefix
                for (int i = 0; i < level; i++) {
                    text.append("#");
                }
                text.append(" ");
            } else if ("listItem".equals(type)) {
                text.append("- ");
            } else if ("blockquote".equals(type)) {
                text.append("> ");
            } else if ("codeBlock".equals(type)) {
                text.append("```\n");
            }

            // Extract direct text if present
            Object blockText = block.get("text");
            if (blockText != null) {
                text.append(blockText.toString());
            }

            // Process child content
            Object children = block.get("content");
            if (children instanceof List) {
                List<Object> childList = (List<Object>) children;
                for (Object child : childList) {
                    String childText = extractTextFromContent(child);
                    if (!childText.isEmpty()) {
                        text.append(childText);
                    }
                }
            }

            // Close code block if needed
            if ("codeBlock".equals(type)) {
                text.append("\n```");
            }

            // Add newline for block-level elements
            if (isBlockElement(type) && text.length() > 0) {
                text.append("\n");
            }

        } else if (content instanceof List) {
            List<Object> contentList = (List<Object>) content;
            for (Object item : contentList) {
                String itemText = extractTextFromContent(item);
                if (!itemText.isEmpty()) {
                    text.append(itemText);
                }
            }
        } else if (content instanceof String) {
            text.append(content.toString());
        }

        return text.toString();
    }

    private boolean isBlockElement(String type) {
        return type != null && (type.equals("paragraph") ||
                type.equals("heading") ||
                type.equals("bulletList") ||
                type.equals("orderedList") ||
                type.equals("listItem") ||
                type.equals("blockquote") ||
                type.equals("codeBlock") ||
                type.equals("horizontalRule") ||
                type.equals("table"));
    }

    private String getStringFromMap(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        if (value == null) {
            return defaultValue;
        }
        return value.toString();
    }

    /**
     * Truncate content to maxLength, adding "..." suffix if truncated.
     */
    private String truncateContent(String content, int maxLength) {
        if (content == null) {
            return "";
        }
        if (content.length() <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength - 3) + "...";
    }

    /** Build the canonical title block plus markdown-like body blocks for AI writes. */
    private Map<String, Object> convertToPageDocument(String title, String content) {
        Map<String, Object> doc = new LinkedHashMap<>();
        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(titleNode(title));

        if (StrUtil.isNotBlank(content)) {
            for (String raw : content.split("\\n\\n+")) {
                String value = raw.trim();
                if (value.isEmpty()) {
                    continue;
                }
                int level = 0;
                if (value.startsWith("### ")) {
                    level = 3;
                    value = value.substring(4).trim();
                } else if (value.startsWith("## ")) {
                    level = 2;
                    value = value.substring(3).trim();
                } else if (value.startsWith("# ")) {
                    level = 1;
                    value = value.substring(2).trim();
                }
                blocks.add(textBlock(level > 0 ? "heading" : "paragraph", value, level));
            }
        }
        if (blocks.size() == 1) {
            blocks.add(textBlock("paragraph", "", 0));
        }
        doc.put("type", "doc");
        doc.put("content", blocks);
        return doc;
    }

    private Map<String, Object> titleNode(String title) {
        String headingId = IdUtil.fastSimpleUUID();
        Map<String, Object> headingAttrs = new LinkedHashMap<>();
        headingAttrs.put("id", headingId);
        headingAttrs.put("level", 1);
        headingAttrs.put("data-toc-id", headingId);
        Map<String, Object> heading = node("heading", headingAttrs);
        heading.put("content", new ArrayList<>(Arrays.asList(textNode(StrUtil.blankToDefault(title, Page.UNTITLE)))));

        Map<String, Object> titleAttrs = new LinkedHashMap<>();
        titleAttrs.put("id", IdUtil.fastSimpleUUID());
        titleAttrs.put("uuid", null);
        Map<String, Object> titleNode = node(BlockDocCodec.TYPE_TITLE, titleAttrs);
        titleNode.put("content", new ArrayList<>(Arrays.asList(heading)));
        return titleNode;
    }

    private Map<String, Object> textBlock(String type, String text, int headingLevel) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        String id = IdUtil.fastSimpleUUID();
        attrs.put("id", id);
        if (headingLevel > 0) {
            attrs.put("level", headingLevel);
            attrs.put("data-toc-id", id);
        }
        Map<String, Object> block = node(type, attrs);
        if (StrUtil.isNotBlank(text)) {
            block.put("content", new ArrayList<>(Arrays.asList(textNode(text))));
        }
        return block;
    }

    private Map<String, Object> node(String type, Map<String, Object> attrs) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", type);
        node.put("attrs", attrs);
        return node;
    }

    private Map<String, Object> textNode(String text) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", "text");
        node.put("text", text);
        return node;
    }

    private void replaceDocumentTitle(Map<String, Object> doc, String title) {
        for (Map<String, Object> block : BlockDocCodec.childrenOf(doc)) {
            if (!BlockDocCodec.TYPE_TITLE.equals(block.get("type"))) {
                continue;
            }
            List<Map<String, Object>> children = BlockDocCodec.childrenOf(block);
            Map<String, Object> heading;
            if (children.isEmpty() || !"heading".equals(children.get(0).get("type"))) {
                heading = BlockDocCodec.childrenOf(titleNode(title)).get(0);
                block.put("content", new ArrayList<>(Arrays.asList(heading)));
            } else {
                heading = children.get(0);
                heading.put("content", new ArrayList<>(Arrays.asList(textNode(title))));
            }
            return;
        }
        List<Map<String, Object>> content = BlockDocCodec.childrenOf(doc);
        content.add(0, titleNode(title));
        doc.put("content", content);
    }
}
