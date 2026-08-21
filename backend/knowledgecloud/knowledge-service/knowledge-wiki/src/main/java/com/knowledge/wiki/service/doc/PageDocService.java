package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
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
     * Mirror the title block's text onto {@code wiki_page.title}.
     * <p>
     * The title block is the authority; this copy exists because the page tree,
     * search results and breadcrumbs all read the column. Without the mirror,
     * renaming a page would stop being visible anywhere outside the editor.
     * </p>
     */
    public void syncPageTitle(Long pageId, String titleText) {
        if (titleText == null) {
            return;
        }
        String title = StrUtil.blankToDefault(titleText.trim(), Page.UNTITLE);
        pageService.lambdaUpdate()
                .eq(Page::getId, pageId)
                .set(Page::getTitle, title)
                .update();
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
