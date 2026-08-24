package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.wiki.service.doc.PageBlockIndex.Meta;
import com.knowledge.wiki.service.entity.PageCheckpoint;
import com.knowledge.wiki.service.entity.PageHead;
import com.knowledge.wiki.service.entity.PageOp;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.dto.ApplyOpsDTO;
import com.knowledge.wiki.service.entity.dto.BlockOpDTO;
import com.knowledge.wiki.service.entity.dto.ReconcileDTO;
import com.knowledge.wiki.service.entity.event.PageDocChangedEvent;
import com.knowledge.wiki.service.entity.vo.ApplyOpsVO;
import com.knowledge.wiki.service.entity.vo.OpResultVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PageHeadMapper;
import com.knowledge.wiki.service.mapper.PageOpMapper;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Applies write intent to the authoritative block tables.
 * <p>
 * Everything that changes a page goes through here: interactive editing, AI
 * writes, imports, restores, and reconciliation. There is exactly one code path
 * that mutates {@code wiki_block}, so ordering rules, cascade rules and journal
 * fidelity cannot diverge between callers.
 * </p>
 * <p>
 * <b>Serialisation.</b> Every batch opens by locking the page's
 * {@code wiki_page_head} row. Same-page writes queue; different-page writes never
 * contend. Once sessions land, the host check will reject non-host writers before
 * they get this far, and this lock becomes the correctness backstop rather than
 * the primary mechanism.
 * </p>
 * <p>
 * <b>Reads are permission-checked by the caller.</b> This service assumes the
 * caller has already established that the actor may write the page.
 * </p>
 */
@Service
@Slf4j
public class PageOpService {

    /** How many accepted batches between automatic checkpoints. */
    private static final int CHECKPOINT_OP_INTERVAL = 200;

    private static final String REASON_ANCHOR_NOT_FOUND = "anchorNotFound";

    private static final String REASON_BAD_POS = "badPosition";

    private static final String REASON_CONCURRENT_CHANGE = "concurrentChange";

    private static final String REASON_CYCLE = "wouldCreateCycle";

    private static final String REASON_DELETED = "deleted";

    private static final String REASON_MISSING_NODE = "missingNode";

    private static final String REASON_PARENT_MISMATCH = "parentMismatch";

    private static final String REASON_PARENT_NOT_FOUND = "parentNotFound";

    private static final String REASON_UNKNOWN_OP = "unknownOp";

    @Autowired
    private WikiBlockMapper wikiBlockMapper;

    @Autowired
    private PageHeadMapper pageHeadMapper;

    @Autowired
    private PageOpMapper pageOpMapper;

    @Autowired
    private PageDocService pageDocService;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    /**
     * Apply a batch of ops. Each op gets its own verdict; a rejected or stale op
     * does not abort the batch, because a collaborative writer's batch routinely
     * mixes blocks someone else has touched with blocks nobody has.
     */
    @Transactional(rollbackFor = Exception.class)
    public ApplyOpsVO applyOps(Long pageId, ApplyOpsDTO request, Long actor) {
        if (pageId == null || request == null || CollUtil.isEmpty(request.getOps())) {
            throw WikiException.INVALID_PARAMETER.newException("ops 不能为空");
        }

        PageHead head = lockHead(pageId);

        ApplyOpsVO replay = replayIfAlreadyApplied(pageId, request, head);
        if (replay != null) {
            return replay;
        }

        return applyBatch(pageId, head, request.getBaseRev(), request.getIdempotencyKey(), request.getOps(), actor);
    }

    /**
     * Converge the page onto a whole document the caller believes to be correct,
     * by diffing it against current state and applying the difference.
     * <p>
     * The diff is <b>keyed on block id</b>, never a wholesale overwrite. This
     * distinction is the entire point of the method: rebuilding the page from the
     * incoming document would reintroduce, exactly, the duplication bug where a
     * second writer's content was appended alongside the first's instead of being
     * recognised as the same blocks.
     * </p>
     * <p>
     * Idempotent by construction: reconciling an already-aligned document produces
     * an empty op list, writes no journal entry, and leaves the rev where it was.
     * </p>
     */
    @Transactional(rollbackFor = Exception.class)
    public ApplyOpsVO reconcile(Long pageId, ReconcileDTO request, Long actor) {
        if (pageId == null || request == null || request.getDoc() == null) {
            throw WikiException.INVALID_PARAMETER.newException("doc 不能为空");
        }

        PageHead head = lockHead(pageId);
        if (request.getBaseRev() != null && request.getBaseRev() != revOf(head)) {
            throw WikiException.PAGE_REVISION_CONFLICT.newException();
        }
        List<WikiBlock> current = pageDocService.loadBlocks(pageId);
        List<BlockOpDTO> ops = diffToOps(request.getDoc(), current);

        if (ops.isEmpty()) {
            return unchanged(head, new ArrayList<>());
        }
        // baseRev is intentionally not forwarded: a reconcile *is* the caller's
        // assertion about the whole document, so per-block staleness checks against
        // an older base would reject the very changes it exists to apply.
        return applyBatch(pageId, head, null, null, ops, actor);
    }

    /**
     * Current rev, creating nothing. Callers that need a rev without writing use
     * {@code PageDocService#readRev}; this overload exists for writers that already
     * hold the batch's head.
     */
    private static long revOf(PageHead head) {
        return head == null || head.getRev() == null ? 0L : head.getRev();
    }

    /** Ensure the page has its rev-0 serialisation row and hold its write lock. */
    @Transactional(rollbackFor = Exception.class)
    public long ensureHead(Long pageId) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        return revOf(lockHead(pageId));
    }

    /**
     * Advance history for a successful state command whose reconcile was already
     * identical (notably restoring an older rev with the same content). The empty
     * normalised op array is replayable and preserves the forward-restore contract.
     */
    @Transactional(rollbackFor = Exception.class)
    public ApplyOpsVO recordStateCommand(Long pageId, Long actor) {
        PageHead head = lockHead(pageId);
        long newRev = revOf(head) + 1;
        bumpHead(head, newRev, actor);
        writeJournal(pageId, newRev, actor, null, new ArrayList<Map<String, Object>>());
        pageDocService.syncPageMeta(pageId, actor, false, null, null);

        ApplyOpsVO result = new ApplyOpsVO();
        result.setRev(newRev);
        result.setOpsApplied(0);
        result.setResults(new ArrayList<OpResultVO>());
        return result;
    }

    // ------------------------------------------------------------------
    // Batch application
    // ------------------------------------------------------------------

    private ApplyOpsVO applyBatch(Long pageId, PageHead head, Long baseRev, String idempotencyKey,
            List<BlockOpDTO> ops, Long actor) {
        long headRev = revOf(head);
        long newRev = headRev + 1;

        PageBlockIndex index = PageBlockIndex.of(pageDocService.loadBlockMeta(pageId));
        BatchState state = new BatchState(pageId, newRev, baseRev, headRev, index);

        List<OpResultVO> results = new ArrayList<>(ops.size());
        for (BlockOpDTO op : ops) {
            results.add(dispatch(state, op));
        }

        if (state.journal.isEmpty()) {
            // Nothing changed. Not advancing the rev is load-bearing: a no-op
            // reconcile must be observably free, or every client that re-checks its
            // document would keep bumping the version of a page nobody edited.
            return unchanged(head, results);
        }

        flush(state);
        bumpHead(head, newRev, actor);
        writeJournal(pageId, newRev, actor, idempotencyKey, state.journal);
        pageDocService.syncPageMeta(pageId, actor, state.titleTouched, state.titleText, state.titleNode);

        if (newRev % CHECKPOINT_OP_INTERVAL == 0) {
            pageDocService.writeCheckpoint(pageId, newRev, actor, PageCheckpoint.KIND_AUTO, null);
        }

        ApplyOpsVO vo = new ApplyOpsVO();
        vo.setRev(newRev);
        vo.setOpsApplied(state.journal.size());
        vo.setResults(results);

        // Published inside the authoritative transaction; the only consumers are
        // AFTER_COMMIT listeners, so a rollback produces no cache/index/link work.
        eventPublisher.publishEvent(new PageDocChangedEvent(pageId, newRev));
        return vo;
    }

    private OpResultVO dispatch(BatchState state, BlockOpDTO op) {
        if (op == null || StrUtil.isBlank(op.getOp())) {
            return OpResultVO.rejected(null, null, REASON_UNKNOWN_OP);
        }
        switch (op.getOp()) {
            case BlockOpDTO.OP_INSERT:
                return applyInsert(state, op);
            case BlockOpDTO.OP_REPLACE:
                return applyReplace(state, op);
            case BlockOpDTO.OP_MOVE:
                return applyMove(state, op);
            case BlockOpDTO.OP_DELETE:
                return applyDelete(state, op);
            default:
                return OpResultVO.rejected(op.getOp(), op.getBlockId(), REASON_UNKNOWN_OP);
        }
    }

    private OpResultVO applyInsert(BatchState state, BlockOpDTO op) {
        if (op.getNode() == null) {
            return OpResultVO.rejected(op.getOp(), op.getBlockId(), REASON_MISSING_NODE);
        }

        String blockId = StrUtil.isBlank(op.getBlockId()) ? BlockDocCodec.readBlockId(op.getNode()) : op.getBlockId();
        if (StrUtil.isBlank(blockId)) {
            // Assignment at creation, which is allowed — as opposed to regenerating
            // an id a node already carries, which is never allowed. Importers and
            // server-side writers legitimately submit id-less nodes.
            blockId = IdUtil.fastSimpleUUID();
        }

        Meta existing = state.index.get(blockId);
        if (existing != null) {
            // Re-inserting a block that is already present and identical is a
            // retry, not a conflict — answer applied and change nothing. Present
            // but different is a genuine divergence the caller must see.
            BlockDocCodec.FlatBlock probe = BlockDocCodec.toFlatBlock(blockId, typeOf(op.getNode()), op.getNode());
            if (probe.getNodeHash().equals(existing.getNodeHash())) {
                return OpResultVO.applied(op.getOp(), blockId, state.newRev);
            }
            WikiBlock row = wikiBlockMapper.selectById(blockId);
            Map<String, Object> node = row == null ? null : BlockDocCodec.readJson(row.getNode());
            return OpResultVO.stale(op.getOp(), blockId, REASON_CONCURRENT_CHANGE, node);
        }

        Placement placement = resolvePlacement(state, op);
        if (placement.reason != null) {
            return OpResultVO.rejected(op.getOp(), blockId, placement.reason);
        }

        BlockDocCodec.FlatBlock flat = BlockDocCodec.toFlatBlock(blockId, typeOf(op.getNode()), op.getNode());
        state.index.add(new Meta(blockId, placement.parentId, placement.rank, flat.getType(), flat.getNodeHash(),
                state.newRev));
        state.stage(row(state, blockId, placement.parentId, placement.rank, flat));
        state.noteTitle(flat);

        Map<String, Object> journal = new LinkedHashMap<>();
        journal.put("op", BlockOpDTO.OP_INSERT);
        journal.put("blockId", blockId);
        journal.put("parentId", placement.parentId);
        journal.put("rank", placement.rank);
        journal.put("node", flat.getNode());
        state.journal.add(journal);

        return OpResultVO.applied(op.getOp(), blockId, state.newRev);
    }

    private OpResultVO applyReplace(BatchState state, BlockOpDTO op) {
        if (op.getNode() == null) {
            return OpResultVO.rejected(op.getOp(), op.getBlockId(), REASON_MISSING_NODE);
        }
        Meta meta = state.index.get(op.getBlockId());
        if (meta == null) {
            return OpResultVO.stale(op.getOp(), op.getBlockId(), REASON_DELETED, null);
        }
        if (isStale(state, op, meta)) {
            return staleFor(state, op, REASON_CONCURRENT_CHANGE);
        }

        BlockDocCodec.FlatBlock flat = BlockDocCodec.toFlatBlock(op.getBlockId(), typeOf(op.getNode()), op.getNode());
        if (flat.getNodeHash().equals(meta.getNodeHash())) {
            // Identical content. Skipping the write is what keeps an autosave of an
            // untouched block from producing a database round trip and a rev bump.
            return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
        }

        boolean replacedTitle = BlockDocCodec.TYPE_TITLE.equals(meta.getType())
                && !BlockDocCodec.TYPE_TITLE.equals(flat.getType());
        meta.setNodeHash(flat.getNodeHash());
        meta.setType(flat.getType());
        meta.setRev(state.newRev);
        state.stage(row(state, op.getBlockId(), meta.getParentId(), meta.getBlockRank(), flat));
        if (replacedTitle) {
            state.noteTitleDeleted();
        } else {
            state.noteTitle(flat);
        }

        Map<String, Object> journal = new LinkedHashMap<>();
        journal.put("op", BlockOpDTO.OP_REPLACE);
        journal.put("blockId", op.getBlockId());
        journal.put("node", flat.getNode());
        state.journal.add(journal);

        return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
    }

    private OpResultVO applyMove(BatchState state, BlockOpDTO op) {
        Meta meta = state.index.get(op.getBlockId());
        if (meta == null) {
            return OpResultVO.stale(op.getOp(), op.getBlockId(), REASON_DELETED, null);
        }
        if (isStale(state, op, meta)) {
            return staleFor(state, op, REASON_CONCURRENT_CHANGE);
        }

        Placement placement = resolvePlacement(state, op);
        if (placement.reason != null) {
            return OpResultVO.rejected(op.getOp(), op.getBlockId(), placement.reason);
        }
        if (state.index.isSelfOrDescendant(op.getBlockId(), placement.parentId)) {
            return OpResultVO.rejected(op.getOp(), op.getBlockId(), REASON_CYCLE);
        }

        boolean sameParent = placement.parentId.equals(meta.getParentId());
        if (sameParent && placement.rank.equals(meta.getBlockRank())) {
            return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
        }

        state.index.relocate(meta, placement.parentId, placement.rank);
        meta.setRev(state.newRev);
        state.stageMove(op.getBlockId(), placement.parentId, placement.rank, state.newRev);

        Map<String, Object> journal = new LinkedHashMap<>();
        journal.put("op", BlockOpDTO.OP_MOVE);
        journal.put("blockId", op.getBlockId());
        journal.put("parentId", placement.parentId);
        journal.put("rank", placement.rank);
        state.journal.add(journal);

        return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
    }

    private OpResultVO applyDelete(BatchState state, BlockOpDTO op) {
        Meta meta = state.index.get(op.getBlockId());
        if (meta == null) {
            // Already gone. Deleting twice is the same as deleting once, and a
            // retried flush must not fail on it.
            return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
        }
        if (isStale(state, op, meta)) {
            return staleFor(state, op, REASON_CONCURRENT_CHANGE);
        }

        // Expanded here, not left to the database, so the journal records exactly
        // which rows went away. Replay must not have to re-derive the subtree from a
        // tree that has since changed.
        for (String id : state.index.selfAndDescendants(op.getBlockId())) {
            Meta deleted = state.index.get(id);
            if (deleted != null && BlockDocCodec.TYPE_TITLE.equals(deleted.getType())) {
                state.noteTitleDeleted();
            }
            state.index.remove(id);
            state.stageDelete(id);
            Map<String, Object> journal = new LinkedHashMap<>();
            journal.put("op", BlockOpDTO.OP_DELETE);
            journal.put("blockId", id);
            state.journal.add(journal);
        }

        return OpResultVO.applied(op.getOp(), op.getBlockId(), state.newRev);
    }

    // ------------------------------------------------------------------
    // Placement, staleness
    // ------------------------------------------------------------------

    /** Resolved target slot, or a rejection reason. */
    private static final class Placement {

        private String parentId;

        private String rank;

        private String reason;

        static Placement rejected(String reason) {
            Placement p = new Placement();
            p.reason = reason;
            return p;
        }

        static Placement at(String parentId, String rank) {
            Placement p = new Placement();
            p.parentId = parentId;
            p.rank = rank;
            return p;
        }
    }

    /**
     * Turn an anchor plus a relation into a concrete parent and rank.
     * <p>
     * For {@code after} / {@code before} the parent is taken from the anchor and
     * the caller's {@code parentId} is only validated against it — a writer that
     * disagrees with the server about where its anchor lives is working from a
     * stale tree, and silently honouring its {@code parentId} would move the block
     * somewhere the writer never asked for.
     * </p>
     */
    private Placement resolvePlacement(BatchState state, BlockOpDTO op) {
        String pos = op.getPos();
        if (StrUtil.isBlank(pos)) {
            return Placement.rejected(REASON_BAD_POS);
        }

        Meta anchor = null;
        String parentId = PageBlockIndex.normaliseParent(op.getParentId());

        if (BlockOpDTO.POS_AFTER.equals(pos) || BlockOpDTO.POS_BEFORE.equals(pos)) {
            anchor = state.index.get(op.getRefBlockId());
            if (anchor == null) {
                return Placement.rejected(REASON_ANCHOR_NOT_FOUND);
            }
            if (anchor.getBlockId().equals(op.getBlockId())) {
                return Placement.rejected(REASON_CYCLE);
            }
            if (StrUtil.isNotBlank(op.getParentId()) && !parentId.equals(anchor.getParentId())) {
                return Placement.rejected(REASON_PARENT_MISMATCH);
            }
            parentId = anchor.getParentId();
        } else if (!BlockOpDTO.POS_FIRST_CHILD.equals(pos) && !BlockOpDTO.POS_LAST_CHILD.equals(pos)) {
            return Placement.rejected(REASON_BAD_POS);
        }

        if (!BlockDocCodec.TOP_LEVEL.equals(parentId) && !state.index.contains(parentId)) {
            return Placement.rejected(REASON_PARENT_NOT_FOUND);
        }

        String rank = state.index.resolveRank(parentId, pos, anchor);
        if (rank == null) {
            return Placement.rejected(REASON_BAD_POS);
        }
        return Placement.at(parentId, rank);
    }

    /**
     * Optimistic concurrency, aimed rather than blanket.
     * <p>
     * A stale {@code baseRev} on its own is not a conflict — under collaborative
     * editing it is the normal case. What matters is whether <i>this block</i>
     * changed between the writer's base and now. An explicit {@code expectRev}
     * narrows it further to a single block the writer is sure about.
     * </p>
     */
    private boolean isStale(BatchState state, BlockOpDTO op, Meta meta) {
        if (op.getExpectRev() != null && meta.getRev() > op.getExpectRev()) {
            return true;
        }
        return state.baseRev != null && state.baseRev < state.headRev && meta.getRev() > state.baseRev;
    }

    /**
     * A stale verdict carrying the server's current node, so the writer can
     * re-apply its intent instead of only learning that it lost.
     */
    private OpResultVO staleFor(BatchState state, BlockOpDTO op, String reason) {
        WikiBlock row = wikiBlockMapper.selectById(op.getBlockId());
        Map<String, Object> node = row == null ? null : BlockDocCodec.readJson(row.getNode());
        return OpResultVO.stale(op.getOp(), op.getBlockId(), reason, node);
    }

    // ------------------------------------------------------------------
    // Reconcile diff
    // ------------------------------------------------------------------

    /**
     * Ops that turn {@code current} into {@code doc}, keyed on block id.
     * <p>
     * Order convergence keeps the largest set of blocks whose existing ranks are
     * already in the desired relative order, and moves the rest. That is the
     * minimum number of moves, and the minimum matters for more than tidiness: the
     * cheaper rule of "keep a block only if its rank exceeds the last one kept" is
     * badly asymmetric, emitting one move for a block dragged down but one move per
     * intervening block for a block dragged up. Same final order, but a batch and a
     * version history proportional to page size instead of to the edit.
     * </p>
     * <p>
     * An already-aligned document still emits nothing, which is the property this
     * is really built on.
     * </p>
     * <p>
     * Package-private and static so the idempotency property above can be asserted
     * directly, without a database. It is the main defence against the duplication
     * bug returning, so it is the one piece of this class that must be provable in
     * isolation.
     * </p>
     */
    static List<BlockOpDTO> diffToOps(Map<String, Object> doc, List<WikiBlock> current) {
        List<BlockDocCodec.FlatBlock> desired = BlockDocCodec.flatten(doc);
        Map<String, WikiBlock> currentById = new HashMap<>();
        for (WikiBlock row : current) {
            currentById.put(row.getBlockId(), row);
        }
        Set<String> keepsItsRank = blocksThatKeepTheirRank(desired, currentById);

        List<BlockOpDTO> ops = new ArrayList<>();
        Set<String> desiredIds = new HashSet<>();
        String prevId = null;

        for (BlockDocCodec.FlatBlock block : desired) {
            desiredIds.add(block.getBlockId());
            WikiBlock existing = currentById.get(block.getBlockId());

            if (existing == null) {
                ops.add(insertOp(block, prevId));
            } else {
                if (!block.getNodeHash().equals(existing.getNodeHash())) {
                    ops.add(replaceOp(block));
                }
                if (!keepsItsRank.contains(block.getBlockId())) {
                    ops.add(moveOp(block.getBlockId(), prevId));
                }
            }
            prevId = block.getBlockId();
        }

        for (WikiBlock row : current) {
            if (!desiredIds.contains(row.getBlockId())) {
                BlockOpDTO op = new BlockOpDTO();
                op.setOp(BlockOpDTO.OP_DELETE);
                op.setBlockId(row.getBlockId());
                ops.add(op);
            }
        }
        return ops;
    }

    /**
     * The blocks that may stay exactly where they are: a longest subsequence of the
     * desired order whose existing ranks are already strictly increasing.
     * <p>
     * Only blocks currently at top level are eligible — a nested row has no
     * top-level position to keep, so it must move regardless of its rank. Rows with
     * no rank at all are likewise ineligible; there is nothing to preserve.
     * </p>
     * <p>
     * Patience sorting, O(n log n). {@code tails[k]} holds the index of the smallest
     * possible tail of an increasing run of length k+1, and {@code prev} threads
     * each index back to its predecessor so the run itself can be recovered rather
     * than just its length.
     * </p>
     */
    private static Set<String> blocksThatKeepTheirRank(List<BlockDocCodec.FlatBlock> desired,
            Map<String, WikiBlock> currentById) {
        List<String> ids = new ArrayList<>();
        List<String> ranks = new ArrayList<>();
        for (BlockDocCodec.FlatBlock block : desired) {
            WikiBlock existing = currentById.get(block.getBlockId());
            if (existing == null || existing.getBlockRank() == null) {
                continue;
            }
            if (!BlockDocCodec.TOP_LEVEL.equals(PageBlockIndex.normaliseParent(existing.getParentId()))) {
                continue;
            }
            ids.add(block.getBlockId());
            ranks.add(existing.getBlockRank());
        }

        int n = ranks.size();
        int[] tails = new int[n];
        int[] prev = new int[n];
        int length = 0;
        for (int i = 0; i < n; i++) {
            int lo = 0;
            int hi = length;
            while (lo < hi) {
                int mid = (lo + hi) >>> 1;
                if (ranks.get(tails[mid]).compareTo(ranks.get(i)) < 0) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            prev[i] = lo > 0 ? tails[lo - 1] : -1;
            tails[lo] = i;
            if (lo == length) {
                length++;
            }
        }

        Set<String> keep = new HashSet<>();
        for (int at = length == 0 ? -1 : tails[length - 1]; at != -1; at = prev[at]) {
            keep.add(ids.get(at));
        }
        return keep;
    }

    private static BlockOpDTO insertOp(BlockDocCodec.FlatBlock block, String afterId) {
        BlockOpDTO op = new BlockOpDTO();
        op.setOp(BlockOpDTO.OP_INSERT);
        op.setBlockId(block.getBlockId());
        op.setNode(block.getNode());
        applyAnchor(op, afterId);
        return op;
    }

    private static BlockOpDTO replaceOp(BlockDocCodec.FlatBlock block) {
        BlockOpDTO op = new BlockOpDTO();
        op.setOp(BlockOpDTO.OP_REPLACE);
        op.setBlockId(block.getBlockId());
        op.setNode(block.getNode());
        return op;
    }

    private static BlockOpDTO moveOp(String blockId, String afterId) {
        BlockOpDTO op = new BlockOpDTO();
        op.setOp(BlockOpDTO.OP_MOVE);
        op.setBlockId(blockId);
        applyAnchor(op, afterId);
        return op;
    }

    /**
     * Anchor a block after its predecessor in the desired sequence, or at the head
     * of the document when it has none.
     */
    private static void applyAnchor(BlockOpDTO op, String afterId) {
        if (StrUtil.isBlank(afterId)) {
            op.setPos(BlockOpDTO.POS_FIRST_CHILD);
            op.setParentId(BlockDocCodec.TOP_LEVEL);
        } else {
            op.setPos(BlockOpDTO.POS_AFTER);
            op.setRefBlockId(afterId);
        }
    }

    // ------------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------------

    /**
     * Lock the page's head row, creating it on first write.
     * <p>
     * The insert races with any other first writer for the same page; the primary
     * key decides, and the loser re-reads the winner's row under the lock. Doing it
     * this way means no page needs a head row provisioned ahead of time.
     * </p>
     */
    private PageHead lockHead(Long pageId) {
        PageHead head = pageHeadMapper.selectForUpdate(pageId);
        if (head != null) {
            return head;
        }
        PageHead created = new PageHead();
        created.setPageId(pageId);
        created.setRev(0L);
        try {
            pageHeadMapper.insert(created);
        } catch (DuplicateKeyException e) {
            log.debug("lockHead: pageId={} head row created concurrently, re-reading", pageId);
        }
        head = pageHeadMapper.selectForUpdate(pageId);
        if (head == null) {
            throw WikiException.PAGE_NOT_FOUND.newException("无法建立页面写入串行点");
        }
        return head;
    }

    private void bumpHead(PageHead head, long newRev, Long actor) {
        head.setRev(newRev);
        head.setLastActor(actor);
        head.setUpdatedAt(LocalDateTime.now());
        pageHeadMapper.updateById(head);
    }

    private void writeJournal(Long pageId, long rev, Long actor, String idempotencyKey,
            List<Map<String, Object>> journal) {
        PageOp entry = new PageOp();
        entry.setPageId(pageId);
        entry.setRev(rev);
        entry.setActor(actor);
        entry.setOps(BlockDocCodec.writeJson(journal));
        entry.setIdempotencyKey(StrUtil.emptyToNull(idempotencyKey));
        entry.setCreatedAt(LocalDateTime.now());
        pageOpMapper.insert(entry);
    }

    private void flush(BatchState state) {
        // Only rows that were actually on disk need a delete statement; a block
        // inserted and removed within the same batch never reached the table.
        Set<String> removals = new HashSet<>(state.deletes);
        removals.retainAll(state.existedAtLoad);
        if (!removals.isEmpty()) {
            wikiBlockMapper.deleteBatchIds(removals);
        }
        for (WikiBlock row : state.upserts.values()) {
            if (state.existedAtLoad.contains(row.getBlockId())) {
                wikiBlockMapper.updateById(row);
            } else {
                wikiBlockMapper.insert(row);
            }
        }
        for (MoveRow move : state.moves.values()) {
            // Parent, rank and rev only: null fields are not written, so a move
            // cannot disturb content. This is why move is its own op.
            WikiBlock row = new WikiBlock();
            row.setBlockId(move.blockId);
            row.setParentId(move.parentId);
            row.setBlockRank(move.rank);
            row.setRev(move.rev);
            wikiBlockMapper.updateById(row);
        }
    }

    private WikiBlock row(BatchState state, String blockId, String parentId, String rank,
            BlockDocCodec.FlatBlock flat) {
        WikiBlock row = new WikiBlock();
        row.setBlockId(blockId);
        row.setPageId(state.pageId);
        row.setParentId(PageBlockIndex.normaliseParent(parentId));
        row.setBlockRank(rank);
        row.setType(flat.getType());
        row.setNode(flat.getNodeJson());
        row.setNodeHash(flat.getNodeHash());
        row.setText(flat.getText());
        row.setRev(state.newRev);
        return row;
    }

    private ApplyOpsVO unchanged(PageHead head, List<OpResultVO> results) {
        ApplyOpsVO vo = new ApplyOpsVO();
        vo.setRev(revOf(head));
        vo.setOpsApplied(0);
        vo.setResults(results);
        return vo;
    }

    /**
     * A batch resubmitted under a key that has already been applied returns the
     * original rev rather than applying anything. What it cannot return is the
     * original per-op verdicts — those are not journalled, since the journal stores
     * what happened, not what was asked. The caller learns the batch landed and at
     * which rev, which is what a retry needs.
     */
    private ApplyOpsVO replayIfAlreadyApplied(Long pageId, ApplyOpsDTO request, PageHead head) {
        if (StrUtil.isBlank(request.getIdempotencyKey())) {
            return null;
        }
        PageOp existing = pageOpMapper.selectOne(Wrappers.<PageOp>lambdaQuery()
                .eq(PageOp::getPageId, pageId)
                .eq(PageOp::getIdempotencyKey, request.getIdempotencyKey())
                .last("LIMIT 1"));
        if (existing == null) {
            return null;
        }
        ApplyOpsVO vo = new ApplyOpsVO();
        vo.setRev(existing.getRev());
        vo.setReplayed(true);
        vo.setResults(new ArrayList<>());
        log.debug("applyOps: pageId={} replayed idempotencyKey={} at rev={}", pageId, request.getIdempotencyKey(),
                existing.getRev());
        return vo;
    }

    private String typeOf(Map<String, Object> node) {
        Object type = node.get("type");
        return type instanceof String ? (String) type : "paragraph";
    }

    /** A rank/parent-only update, so a move never rewrites content. */
    private static final class MoveRow {

        private final String blockId;

        private final String parentId;

        private final String rank;

        private final long rev;

        MoveRow(String blockId, String parentId, String rank, long rev) {
            this.blockId = blockId;
            this.parentId = parentId;
            this.rank = rank;
            this.rev = rev;
        }
    }

    /** Everything one batch accumulates before it is flushed. */
    private static final class BatchState {

        private final Long pageId;

        private final long newRev;

        private final Long baseRev;

        private final long headRev;

        private final PageBlockIndex index;

        private final Set<String> existedAtLoad;

        private final Map<String, WikiBlock> upserts = new LinkedHashMap<>();

        private final Map<String, MoveRow> moves = new LinkedHashMap<>();

        private final Set<String> deletes = new HashSet<>();

        private final List<Map<String, Object>> journal = new ArrayList<>();

        /** Whether the batch changed or deleted the title block. */
        private boolean titleTouched;

        /** Text of the title block, when this batch touched it. */
        private String titleText;

        /**
         * The title block's node JSON, when this batch touched it. Kept whole so
         * the page-row mirror can also sync icon and tags, not just the text.
         */
        private Map<String, Object> titleNode;

        BatchState(Long pageId, long newRev, Long baseRev, long headRev, PageBlockIndex index) {
            this.pageId = pageId;
            this.newRev = newRev;
            this.baseRev = baseRev;
            this.headRev = headRev;
            this.index = index;
            // Snapshot of what is on disk, taken before any op runs. It decides
            // insert-vs-update at flush time, and it is taken from the id set rather
            // than by walking the tree so a block whose parent is missing is still
            // recognised as an existing row.
            this.existedAtLoad = index.allIds();
        }

        void stage(WikiBlock row) {
            deletes.remove(row.getBlockId());
            // A full row write supersedes a pending move of the same block: it
            // already carries the block's current parent and rank.
            moves.remove(row.getBlockId());
            upserts.put(row.getBlockId(), row);
        }

        void stageMove(String blockId, String parentId, String rank, long rev) {
            WikiBlock pending = upserts.get(blockId);
            if (pending != null) {
                pending.setParentId(parentId);
                pending.setBlockRank(rank);
                pending.setRev(rev);
                return;
            }
            moves.put(blockId, new MoveRow(blockId, parentId, rank, rev));
        }

        void stageDelete(String blockId) {
            upserts.remove(blockId);
            moves.remove(blockId);
            deletes.add(blockId);
        }

        void noteTitle(BlockDocCodec.FlatBlock flat) {
            if (BlockDocCodec.TYPE_TITLE.equals(flat.getType())) {
                titleTouched = true;
                titleText = flat.getText();
                titleNode = flat.getNode();
            }
        }

        void noteTitleDeleted() {
            titleTouched = true;
            titleText = null;
            titleNode = null;
        }
    }

}
