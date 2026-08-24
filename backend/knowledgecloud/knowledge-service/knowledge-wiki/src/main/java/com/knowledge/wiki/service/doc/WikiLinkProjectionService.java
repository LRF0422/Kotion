package com.knowledge.wiki.service.doc;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.WikiLink;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;
import com.knowledge.wiki.service.service.IWikiLinkService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

/** Rebuilds the disposable {@code wiki_link} projection from {@code wiki_block.node}. */
@Service
public class WikiLinkProjectionService {

    private static final String LINK_TYPE_PAGE = "PAGE";
    private static final String LINK_TYPE_BLOCK = "BLOCK";
    private static final String LINK_KIND_NORMAL = "NORMAL";
    private static final String LINK_KIND_MENTION = "MENTION";
    private static final String LINK_KIND_EMBED = "EMBED";

    @Autowired
    private WikiBlockMapper wikiBlockMapper;

    @Autowired
    private IWikiLinkService wikiLinkService;

    @Transactional(rollbackFor = Exception.class)
    public int syncPage(Long pageId) {
        if (pageId == null) {
            return 0;
        }
        List<WikiBlock> rows = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                .eq(WikiBlock::getPageId, pageId));
        List<WikiLink> links = extractLinks(pageId, rows);
        wikiLinkService.remove(new LambdaQueryWrapper<WikiLink>()
                .eq(WikiLink::getSourceType, LINK_TYPE_PAGE)
                .eq(WikiLink::getSourcePageId, pageId));
        if (CollUtil.isNotEmpty(links)) {
            wikiLinkService.saveBatch(links);
        }
        return links.size();
    }

    /** Full projection rebuild; safe to rerun after any listener failure. */
    @Transactional(rollbackFor = Exception.class)
    public int rebuildAll() {
        List<WikiBlock> rows = wikiBlockMapper.selectList(new LambdaQueryWrapper<WikiBlock>()
                .orderByAsc(WikiBlock::getPageId, WikiBlock::getBlockRank));
        Map<Long, List<WikiBlock>> byPage = new LinkedHashMap<>();
        for (WikiBlock row : rows) {
            byPage.computeIfAbsent(row.getPageId(), ignored -> new ArrayList<>()).add(row);
        }

        List<WikiLink> all = new ArrayList<>();
        for (Map.Entry<Long, List<WikiBlock>> entry : byPage.entrySet()) {
            all.addAll(extractLinks(entry.getKey(), entry.getValue()));
        }

        wikiLinkService.remove(new LambdaQueryWrapper<WikiLink>().isNotNull(WikiLink::getId));
        if (CollUtil.isNotEmpty(all)) {
            wikiLinkService.saveBatch(all);
        }
        return all.size();
    }

    static List<WikiLink> extractLinks(Long pageId, List<WikiBlock> rows) {
        List<WikiLink> raw = new ArrayList<>();
        if (pageId == null || CollUtil.isEmpty(rows)) {
            return raw;
        }
        for (WikiBlock row : rows) {
            Map<String, Object> node = BlockDocCodec.readJson(row.getNode());
            if (node != null) {
                walk(node, pageId, raw);
            }
        }

        List<WikiLink> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (WikiLink link : raw) {
            String key = link.getTargetType() + ":" + link.getLinkKind() + ":"
                    + StrUtil.nullToEmpty(link.getTargetId()) + ":"
                    + (link.getTargetPageId() == null ? "" : link.getTargetPageId());
            if (seen.add(key)) {
                result.add(link);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void walk(Map<String, Object> node, Long sourcePageId, List<WikiLink> links) {
        String type = string(node.get("type"));
        Map<String, Object> attrs = map(node.get("attrs"));
        WikiLink nodeLink = fromNode(type, attrs, node, sourcePageId);
        if (nodeLink != null) {
            links.add(nodeLink);
        }

        Object marks = node.get("marks");
        if (marks instanceof List) {
            for (Object item : (List<?>) marks) {
                Map<String, Object> mark = map(item);
                WikiLink markLink = fromMark(mark, node, sourcePageId);
                if (markLink != null) {
                    links.add(markLink);
                }
            }
        }

        Object content = node.get("content");
        if (content instanceof List) {
            for (Object item : (List<?>) content) {
                Map<String, Object> child = map(item);
                if (child != null) {
                    walk(child, sourcePageId, links);
                }
            }
        }
    }

    private static WikiLink fromMark(Map<String, Object> mark, Map<String, Object> node, Long sourcePageId) {
        if (mark == null || !"pageLink".equals(string(mark.get("type")))) {
            return null;
        }
        Map<String, Object> attrs = map(mark.get("attrs"));
        if (attrs == null) {
            return null;
        }
        WikiLink link = base(sourcePageId);
        link.setTargetType(LINK_TYPE_PAGE);
        link.setLinkKind(LINK_KIND_NORMAL);
        applyPageTarget(link, attrs);
        if (unresolved(link)) {
            return null;
        }
        link.setSnippet(string(node.get("text")));
        return link;
    }

    private static WikiLink fromNode(String type, Map<String, Object> attrs, Map<String, Object> node,
            Long sourcePageId) {
        if (StrUtil.isBlank(type)) {
            return null;
        }
        WikiLink link = base(sourcePageId);
        switch (type) {
            case "pageLink":
            case "pageLinkNode":
            case "PageReference":
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_NORMAL);
                applyPageTarget(link, attrs);
                break;
            case "BlockReference":
            case "blockEmbed":
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_EMBED);
                applyBlockTarget(link, attrs);
                break;
            case "blockLink":
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_NORMAL);
                applyBlockTarget(link, attrs);
                break;
            case "pageMention":
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_MENTION);
                applyPageTarget(link, attrs);
                break;
            case "blockMention":
                link.setTargetType(LINK_TYPE_BLOCK);
                link.setLinkKind(LINK_KIND_MENTION);
                applyBlockTarget(link, attrs);
                break;
            case "pageEmbed":
                link.setTargetType(LINK_TYPE_PAGE);
                link.setLinkKind(LINK_KIND_EMBED);
                applyPageTarget(link, attrs);
                break;
            default:
                return null;
        }
        if (unresolved(link)) {
            return null;
        }
        String snippet = string(node.get("text"));
        if (StrUtil.isBlank(snippet) && attrs != null) {
            snippet = string(attrs.get("title"));
        }
        link.setSnippet(snippet);
        return link;
    }

    private static WikiLink base(Long sourcePageId) {
        WikiLink link = new WikiLink();
        link.setSourceType(LINK_TYPE_PAGE);
        link.setSourceId(String.valueOf(sourcePageId));
        link.setSourcePageId(sourcePageId);
        return link;
    }

    private static void applyPageTarget(WikiLink link, Map<String, Object> attrs) {
        if (attrs == null) {
            return;
        }
        String pageId = string(attrs.get("pageId"));
        link.setTargetId(pageId);
        link.setTargetPageId(longValue(attrs.get("pageId")));
    }

    private static void applyBlockTarget(WikiLink link, Map<String, Object> attrs) {
        if (attrs == null) {
            return;
        }
        link.setTargetId(string(attrs.get("blockId")));
        link.setTargetPageId(longValue(attrs.get("pageId")));
    }

    private static boolean unresolved(WikiLink link) {
        return link.getTargetPageId() == null && StrUtil.isBlank(link.getTargetId());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : null;
    }

    private static String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Long longValue(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
