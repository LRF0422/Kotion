package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.IconType;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageCheckpoint;
import com.knowledge.wiki.service.entity.PageHead;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.mapper.PageCheckpointMapper;
import com.knowledge.wiki.service.mapper.PageHeadMapper;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;
import com.knowledge.wiki.service.service.IPageService;

import cn.hutool.core.util.StrUtil;
import cn.hutool.core.util.ZipUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Read side of the authoritative block store, plus checkpoint materialisation.
 * <p>
 * Reads never reassemble a block from child rows — each row already holds its
 * complete subtree, and {@link BlockDocCodec#assemble} only orders the rows and
 * hands their stored JSON back. That is the whole reason the read path can no
 * longer damage a container's inline content.
 * </p>
 */
@Service
@Slf4j
public class PageDocService {

    private static final String CHECKPOINT_CHARSET = "UTF-8";

    @Autowired
    private WikiBlockMapper wikiBlockMapper;

    @Autowired
    private PageHeadMapper pageHeadMapper;

    @Autowired
    private PageCheckpointMapper pageCheckpointMapper;

    @Autowired
    private IPageService pageService;

    /**
     * The page's current document and the rev it represents.
     * <p>
     * A page with no rows yet returns an empty document at rev 0 rather than an
     * error: "never written under this model" is a legitimate state for every page
     * until the backfill or a first save reaches it.
     * </p>
     */
    public PageDocVO readDoc(Long pageId) {
        List<WikiBlock> rows = loadBlocks(pageId);
        PageDocVO vo = new PageDocVO();
        vo.setDoc(BlockDocCodec.assemble(rows));
        vo.setRev(readRev(pageId));
        vo.setBlockCount(rows.size());
        return vo;
    }

    /** Current rev, 0 when the page has never been written under this model. */
    public long readRev(Long pageId) {
        PageHead head = pageHeadMapper.selectById(pageId);
        return head == null || head.getRev() == null ? 0L : head.getRev();
    }

    /** Every block of the page, node content included. */
    public List<WikiBlock> loadBlocks(Long pageId) {
        return wikiBlockMapper.selectList(Wrappers.<WikiBlock>lambdaQuery()
                .eq(WikiBlock::getPageId, pageId));
    }

    /**
     * Every block of the page, metadata only.
     * <p>
     * Deliberately excludes {@code node} and {@code text}: a write batch needs the
     * shape of the tree, not its content, and pulling every block's JSON would make
     * the cost of editing one block proportional to the size of the page.
     * </p>
     */
    public List<WikiBlock> loadBlockMeta(Long pageId) {
        return wikiBlockMapper.selectList(Wrappers.<WikiBlock>lambdaQuery()
                .select(WikiBlock::getBlockId, WikiBlock::getPageId, WikiBlock::getParentId, WikiBlock::getBlockRank,
                        WikiBlock::getType, WikiBlock::getNodeHash, WikiBlock::getRev)
                .eq(WikiBlock::getPageId, pageId));
    }

    /**
     * Mirror the title block onto {@code wiki_page}: text, icon and tags.
     * <p>
     * The title block is the authority; these copies exist because the page tree,
     * search results, breadcrumbs, favourites and the space graph all read the
     * page row rather than the block store. Without the mirror, a title edit
     * would stop being visible anywhere outside the editor — which is exactly
     * what happened to icon/tag edits when the op path only mirrored the text.
     * </p>
     * <p>
     * Called only when a batch actually touched the title block (a batch that did
     * not leaves {@code titleNode} null), so every update here corresponds to a
     * real change and no dirty-checking is needed. Best-effort: a mirror failure
     * must never fail the save it mirrors.
     * </p>
     */
    public void syncPageTitleMeta(Long pageId, String titleText, Map<String, Object> titleNode) {
        if (titleNode == null) {
            return;
        }
        Map<String, Object> attrs = attrsOf(titleNode);
        String title = titleText == null ? null : StrUtil.blankToDefault(titleText.trim(), Page.UNTITLE);
        boolean hasIcon = attrs != null && attrs.containsKey("icon");
        boolean hasTags = attrs != null && attrs.containsKey("tags");
        Icon icon = hasIcon ? parseIcon(attrs.get("icon")) : null;
        List<String> tags = hasTags ? parseTags(attrs.get("tags")) : null;

        try {
            if (title != null) {
                pageService.lambdaUpdate()
                        .eq(Page::getId, pageId)
                        .set(Page::getTitle, title)
                        .update();
            }
            if (hasIcon) {
                // Icon maps to a JSON column via JacksonTypeHandler (@TableField on
                // Page.icon). lambdaUpdate().set() does NOT pick up that handler
                // automatically, so it must be named explicitly here or the Icon
                // object would be bound as a raw parameter and fail to persist.
                if (icon != null) {
                    pageService.lambdaUpdate()
                            .eq(Page::getId, pageId)
                            .set(Page::getIcon, icon,
                                    "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler")
                            .update();
                } else {
                    // Icon removed: MP's update strategy silently drops null sets,
                    // so clearing the JSON column has to be spelled out.
                    pageService.lambdaUpdate()
                            .eq(Page::getId, pageId)
                            .setSql("icon = NULL")
                            .update();
                }
            }
            if (hasTags) {
                // Same JSON-column caveat as icon: name the type handler explicitly.
                pageService.lambdaUpdate()
                        .eq(Page::getId, pageId)
                        .set(Page::getTags, tags,
                                "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler")
                        .update();
            }
        } catch (Exception e) {
            // Title/icon/tags sync is best-effort; never fail the save because of it.
            log.warn("syncPageTitleMeta: failed to mirror title/icon/tags onto wiki_page pageId={}: {}",
                    pageId, e.getMessage());
        }
    }

    /** Read the icon object off {@code attrs.icon}, tolerating any shape drift. */
    private Icon parseIcon(Object value) {
        if (!(value instanceof Map)) {
            return null;
        }
        Map<?, ?> map = (Map<?, ?>) value;
        Icon icon = new Icon();
        Object iconValue = map.get("icon");
        icon.setIcon(iconValue instanceof String ? (String) iconValue : null);
        Object typeValue = map.get("type");
        if (typeValue instanceof String) {
            try {
                icon.setType(IconType.valueOf((String) typeValue));
            } catch (IllegalArgumentException ignored) {
                // Unknown type: leave it null rather than fail the mirror.
            }
        }
        return icon;
    }

    /** Read the tag list off {@code attrs.tags}; blank entries are dropped. */
    private List<String> parseTags(Object value) {
        List<String> tags = new ArrayList<>();
        if (!(value instanceof List)) {
            return tags;
        }
        for (Object item : (List<?>) value) {
            if (item instanceof String && StrUtil.isNotBlank((String) item)) {
                tags.add(((String) item).trim());
            }
        }
        return tags;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> attrsOf(Map<String, Object> node) {
        Object attrs = node.get("attrs");
        return attrs instanceof Map ? (Map<String, Object>) attrs : null;
    }

    /**
     * Materialise the page at {@code rev} into a checkpoint row.
     * <p>
     * Checkpoints are what keep replay bounded: restoring an arbitrary rev loads
     * the nearest one at or below it and replays only the ops after it. Without
     * them, replay cost would grow with a page's whole lifetime.
     * </p>
     */
    @Transactional(rollbackFor = Exception.class)
    public Long writeCheckpoint(Long pageId, long rev, Long actor, String kind, String label) {
        List<WikiBlock> rows = loadBlocks(pageId);
        Map<String, Object> doc = BlockDocCodec.assemble(rows);

        PageCheckpoint checkpoint = new PageCheckpoint();
        checkpoint.setPageId(pageId);
        checkpoint.setRev(rev);
        checkpoint.setKind(kind);
        checkpoint.setLabel(label);
        checkpoint.setDoc(ZipUtil.gzip(BlockDocCodec.writeJson(doc), CHECKPOINT_CHARSET));
        checkpoint.setBlockCount(rows.size());
        checkpoint.setActor(actor);
        checkpoint.setCreatedAt(LocalDateTime.now());
        try {
            pageCheckpointMapper.insert(checkpoint);
        } catch (DuplicateKeyException e) {
            // One checkpoint per rev. A second attempt at the same rev — an explicit
            // save landing on an automatic cadence boundary, say — is a no-op, not a
            // failure that should roll back the write it belongs to.
            log.debug("writeCheckpoint: pageId={} rev={} already checkpointed", pageId, rev);
            return null;
        }
        return checkpoint.getId();
    }

    /** The document stored in a checkpoint. */
    public Map<String, Object> readCheckpointDoc(PageCheckpoint checkpoint) {
        if (checkpoint == null || checkpoint.getDoc() == null) {
            return null;
        }
        return BlockDocCodec.readJson(ZipUtil.unGzip(checkpoint.getDoc(), CHECKPOINT_CHARSET));
    }

}
