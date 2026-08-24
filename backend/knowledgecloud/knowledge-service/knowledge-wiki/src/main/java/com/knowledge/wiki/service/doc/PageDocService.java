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
import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
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
    @Transactional(readOnly = true)
    public PageDocVO readDoc(Long pageId) {
        PageHead head = pageHeadMapper.selectById(pageId);
        if (head == null) {
            // An absent head means migration has not happened; it is not a valid
            // empty page. Failing closed prevents a client from reconciling an empty
            // document and making the backfill skip the real legacy content later.
            throw com.knowledge.wiki.service.exception.WikiException.PAGE_DOC_NOT_INITIALIZED.newException();
        }
        List<WikiBlock> rows = loadBlocks(pageId);
        PageDocVO vo = new PageDocVO();
        vo.setDoc(BlockDocCodec.assemble(rows));
        vo.setRev(head.getRev() == null ? 0L : head.getRev());
        vo.setBlockCount(rows.size());
        return vo;
    }

    public boolean isInitialized(Long pageId) {
        return pageId != null && pageHeadMapper.selectById(pageId) != null;
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
     * Touch the page update stamp and, when the title block changed, mirror its
     * title/icon/tags onto {@code wiki_page} in the document write transaction.
     * A failed mirror fails the whole write: current blocks, journal, head and page
     * metadata must never describe different successful saves.
     */
    public void syncPageMeta(Long pageId, Long actor, boolean titleTouched, String titleText,
            Map<String, Object> titleNode) {
        LambdaUpdateChainWrapper<Page> update = pageService.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getUpdateTime, LocalDateTime.now())
                .set(Page::getUpdateUser, actor);

        if (titleTouched) {
            String title = StrUtil.blankToDefault(titleText == null ? null : titleText.trim(), Page.UNTITLE);
            update.set(Page::getTitle, title);

            if (titleNode == null) {
                // Deleting the title resets all page-row title metadata.
                update.setSql("icon = NULL")
                        .set(Page::getTags, new ArrayList<String>(),
                                "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler");
            } else {
                Map<String, Object> attrs = attrsOf(titleNode);
                boolean hasIcon = attrs != null && attrs.containsKey("icon");
                boolean hasTags = attrs != null && attrs.containsKey("tags");
                if (hasIcon) {
                    Icon icon = parseIcon(attrs.get("icon"));
                    if (icon == null) {
                        update.setSql("icon = NULL");
                    } else {
                        update.set(Page::getIcon, icon,
                                "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler");
                    }
                }
                if (hasTags) {
                    update.set(Page::getTags, parseTags(attrs.get("tags")),
                            "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler");
                }
            }
        }

        if (!update.update()) {
            throw com.knowledge.wiki.service.exception.WikiException.PAGE_NOT_FOUND.newException();
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
            String type = (String) typeValue;
            if ("IMAGE".equals(type)) {
                // The shared backend enum keeps its historical PICTIRE spelling.
                icon.setType(IconType.PICTIRE);
            } else if ("DATE".equals(type)) {
                // wiki_page has no date-config column; retain the fallback calendar
                // glyph as an emoji while the full DATE config remains in PageDoc.
                icon.setType(IconType.EMOJI);
            } else {
                try {
                    icon.setType(IconType.valueOf(type));
                } catch (IllegalArgumentException ignored) {
                    // Unknown type: leave it null rather than fail the mirror.
                }
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
    public PageCheckpoint writeCheckpoint(Long pageId, long rev, Long actor, String kind, String label) {
        return writeCheckpoint(pageId, rev, actor, kind, label, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public PageCheckpoint writeCheckpoint(Long pageId, long rev, Long actor, String kind, String label,
            Long sourceRev) {
        if (readRev(pageId) != rev) {
            throw com.knowledge.wiki.service.exception.WikiException.INVALID_PARAMETER
                    .newException("只能为当前 rev 创建检查点");
        }
        PageCheckpoint existing = pageCheckpointMapper.selectByPageAndRev(pageId, rev);
        if (existing != null) {
            return updateCheckpointMetadata(existing, actor, kind, label, sourceRev);
        }

        List<WikiBlock> rows = loadBlocks(pageId);
        Map<String, Object> doc = BlockDocCodec.assemble(rows);

        PageCheckpoint checkpoint = new PageCheckpoint();
        checkpoint.setPageId(pageId);
        checkpoint.setRev(rev);
        checkpoint.setKind(kind);
        checkpoint.setLabel(StrUtil.emptyToNull(label));
        checkpoint.setDoc(ZipUtil.gzip(BlockDocCodec.writeJson(doc), CHECKPOINT_CHARSET));
        checkpoint.setBlockCount(rows.size());
        checkpoint.setActor(actor);
        checkpoint.setSourceRev(sourceRev);
        checkpoint.setCreatedAt(LocalDateTime.now());
        try {
            pageCheckpointMapper.insert(checkpoint);
            return checkpoint;
        } catch (DuplicateKeyException e) {
            // A cadence checkpoint and an explicit checkpoint can race at the same
            // rev. Re-read the winner and promote its metadata when appropriate.
            existing = pageCheckpointMapper.selectByPageAndRev(pageId, rev);
            if (existing == null) {
                throw e;
            }
            return updateCheckpointMetadata(existing, actor, kind, label, sourceRev);
        }
    }

    private PageCheckpoint updateCheckpointMetadata(PageCheckpoint existing, Long actor, String kind, String label,
            Long sourceRev) {
        // V10 deliberately allows one materialisation per rev. A later explicit
        // command promotes that same snapshot's presentation metadata (AUTO -> USER
        // or AUTO -> RESTORE) instead of duplicating the blob.
        existing.setKind(kind);
        existing.setLabel(StrUtil.emptyToNull(label));
        existing.setActor(actor);
        existing.setSourceRev(sourceRev);
        existing.setCreatedAt(LocalDateTime.now());
        pageCheckpointMapper.updateMetadata(existing);
        return existing;
    }

    /** The document stored in a checkpoint. */
    public Map<String, Object> readCheckpointDoc(PageCheckpoint checkpoint) {
        if (checkpoint == null || checkpoint.getDoc() == null) {
            return null;
        }
        return BlockDocCodec.readJson(ZipUtil.unGzip(checkpoint.getDoc(), CHECKPOINT_CHARSET));
    }

}
