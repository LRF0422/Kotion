package com.knowledge.wiki.service.doc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.wiki.service.entity.PageCheckpoint;
import com.knowledge.wiki.service.entity.PageOp;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.dto.ReconcileDTO;
import com.knowledge.wiki.service.entity.vo.ApplyOpsVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryListVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryVO;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.entity.vo.RestorePageDocVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PageCheckpointMapper;
import com.knowledge.wiki.service.mapper.PageOpMapper;

import cn.hutool.core.util.StrUtil;

/**
 * Trusted server commands and revision-history reads for the new PageDoc tables.
 * Browser lease enforcement remains in {@link PageDocController}; server writers
 * call this service directly and never need a live collaboration session.
 */
@Service
public class PageDocCommandService {

    private static final int DEFAULT_HISTORY_LIMIT = 100;
    private static final int MAX_HISTORY_LIMIT = 500;

    @Autowired
    private PageDocService pageDocService;

    @Autowired
    private PageOpService pageOpService;

    @Autowired
    private PageCheckpointMapper pageCheckpointMapper;

    @Autowired
    private PageOpMapper pageOpMapper;

    /** Trusted authoritative reconcile for import/restore-style server commands. */
    @Transactional(rollbackFor = Exception.class)
    public ApplyOpsVO reconcileTrusted(Long pageId, Map<String, Object> doc, Long actor) {
        return reconcileTrusted(pageId, doc, actor, null);
    }

    /** Trusted read-modify-write reconcile with optimistic revision protection. */
    @Transactional(rollbackFor = Exception.class)
    public ApplyOpsVO reconcileTrusted(Long pageId, Map<String, Object> doc, Long actor, Long expectedRev) {
        ReconcileDTO request = new ReconcileDTO();
        request.setDoc(doc);
        request.setBaseRev(expectedRev);
        return pageOpService.reconcile(pageId, request, actor);
    }

    /**
     * Initialise a page without consulting legacy storage. Empty content establishes
     * only a rev-0 head; non-empty content becomes rev 1 and an IMPORT baseline.
     */
    @Transactional(rollbackFor = Exception.class)
    public PageDocVO initializePage(Long pageId, Map<String, Object> doc, Long actor, String label) {
        if (pageId == null || doc == null) {
            throw WikiException.INVALID_PARAMETER.newException("doc 不能为空");
        }

        long rev = pageOpService.ensureHead(pageId);
        List<WikiBlock> current = pageDocService.loadBlocks(pageId);
        List<com.knowledge.wiki.service.entity.dto.BlockOpDTO> delta = PageOpService.diffToOps(doc, current);
        if ((rev > 0 || !current.isEmpty()) && !delta.isEmpty()) {
            throw WikiException.INVALID_PARAMETER.newException("页面文档已经初始化");
        }
        if (delta.isEmpty()) {
            return pageDocService.readDoc(pageId);
        }

        ApplyOpsVO applied = reconcileTrusted(pageId, doc, actor);
        pageDocService.writeCheckpoint(pageId, applied.getRev(), actor, PageCheckpoint.KIND_IMPORT,
                StrUtil.blankToDefault(label, "导入基线"));
        return pageDocService.readDoc(pageId);
    }

    /** Create or promote the current revision's checkpoint to an explicit USER point. */
    @Transactional(rollbackFor = Exception.class)
    public PageDocHistoryVO createUserCheckpoint(Long pageId, Long actor, String label) {
        long rev = pageOpService.ensureHead(pageId);
        PageCheckpoint checkpoint = pageDocService.writeCheckpoint(pageId, rev, actor, PageCheckpoint.KIND_USER,
                label);
        PageDocHistoryVO result = historyOf(checkpoint);
        result.setCurrent(true);
        return result;
    }

    /** Cursor history of materialised restore points; the op journal remains replay detail. */
    public PageDocHistoryListVO listHistory(Long pageId, Long beforeRev, Integer requestedLimit) {
        if (pageId == null || (beforeRev != null && beforeRev < 0)) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        int limit = requestedLimit == null ? DEFAULT_HISTORY_LIMIT
                : Math.max(1, Math.min(requestedLimit, MAX_HISTORY_LIMIT));
        long currentRev = pageDocService.readRev(pageId);

        List<PageCheckpoint> checkpoints = pageCheckpointMapper.selectHistory(pageId, beforeRev, limit);
        List<PageDocHistoryVO> records = new ArrayList<>(checkpoints.size());
        for (PageCheckpoint checkpoint : checkpoints) {
            PageDocHistoryVO item = historyOf(checkpoint);
            item.setCurrent(checkpoint.getRev() != null && checkpoint.getRev() == currentRev);
            records.add(item);
        }

        PageDocHistoryListVO result = new PageDocHistoryListVO();
        result.setCurrentRev(currentRev);
        result.setTotal(pageCheckpointMapper.countByPage(pageId));
        result.setRecords(records);
        result.setNextBeforeRev(records.size() == limit ? records.get(records.size() - 1).getRev() : null);
        return result;
    }

    /** Materialise an immutable historical revision from its nearest checkpoint plus ops. */
    public PageDocVO materializeAtRev(Long pageId, long targetRev) {
        if (pageId == null || targetRev < 0) {
            throw WikiException.INVALID_PARAMETER.newException("目标 rev 不存在");
        }
        long currentRev = pageDocService.readRev(pageId);
        if (targetRev > currentRev) {
            throw WikiException.INVALID_PARAMETER.newException("目标 rev 不存在");
        }

        PageCheckpoint checkpoint = pageCheckpointMapper.selectNearestAtOrBefore(pageId, targetRev);
        long checkpointRev = checkpoint == null || checkpoint.getRev() == null ? 0L : checkpoint.getRev();
        Map<String, Object> base = checkpoint == null ? emptyDoc() : pageDocService.readCheckpointDoc(checkpoint);
        if (base == null) {
            throw WikiException.CONTENT_PARSE_ERROR.newException("检查点文档损坏");
        }

        List<PageOp> entries = pageOpMapper.selectForReplay(pageId, checkpointRev, targetRev);
        validateReplayRange(checkpointRev, targetRev, entries);
        Map<String, Object> doc = PageDocReplay.replay(base, entries);
        PageDocVO result = new PageDocVO();
        result.setRev(targetRev);
        result.setDoc(doc);
        result.setBlockCount(PageDocReplay.blockCount(doc));
        return result;
    }

    /** Restore an old revision by reconciling it into a new forward revision. */
    @Transactional(rollbackFor = Exception.class)
    public RestorePageDocVO restore(Long pageId, long targetRev, Long actor, String label) {
        // Hold the page lock across materialisation and forward reconcile so the
        // selected historical state cannot race a browser/server write.
        long currentRev = pageOpService.ensureHead(pageId);
        // The UI promises that the pre-restore content remains recoverable. History
        // lists checkpoints rather than every op rev, so materialise the current rev
        // before writing the historical document forward.
        if (pageCheckpointMapper.selectByPageAndRev(pageId, currentRev) == null) {
            pageDocService.writeCheckpoint(pageId, currentRev, actor, PageCheckpoint.KIND_USER, "恢复前自动保留");
        }
        PageDocVO target = materializeAtRev(pageId, targetRev);
        ApplyOpsVO applied = reconcileTrusted(pageId, target.getDoc(), actor);
        if (applied.getOpsApplied() == 0) {
            applied = pageOpService.recordStateCommand(pageId, actor);
        }
        PageCheckpoint checkpoint = pageDocService.writeCheckpoint(pageId, applied.getRev(), actor,
                PageCheckpoint.KIND_RESTORE, label, targetRev);

        RestorePageDocVO result = new RestorePageDocVO();
        result.setTargetRev(targetRev);
        result.setRev(applied.getRev());
        result.setOpsApplied(applied.getOpsApplied());
        result.setCheckpointId(checkpoint.getId());
        return result;
    }

    static void validateReplayRange(long checkpointRev, long targetRev, List<PageOp> entries) {
        long expected = checkpointRev + 1;
        if (entries != null) {
            for (PageOp entry : entries) {
                if (entry == null || entry.getRev() == null || entry.getRev() != expected) {
                    throw WikiException.CONTENT_PARSE_ERROR
                            .newException("历史日志不连续，期望 rev " + expected);
                }
                expected++;
            }
        }
        if (expected <= targetRev) {
            throw WikiException.CONTENT_PARSE_ERROR
                    .newException("历史日志缺失 rev " + expected + ".." + targetRev);
        }
    }

    private static PageDocHistoryVO historyOf(PageCheckpoint checkpoint) {
        PageDocHistoryVO item = new PageDocHistoryVO();
        item.setCheckpointId(checkpoint.getId());
        item.setRev(checkpoint.getRev());
        item.setKind(checkpoint.getKind());
        item.setLabel(checkpoint.getLabel());
        item.setActor(checkpoint.getActor());
        item.setCreatedAt(checkpoint.getCreatedAt());
        item.setBlockCount(checkpoint.getBlockCount());
        item.setRestoredFromRev(checkpoint.getSourceRev());
        return item;
    }

    private static Map<String, Object> emptyDoc() {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("type", "doc");
        doc.put("content", new ArrayList<Object>());
        return doc;
    }
}
