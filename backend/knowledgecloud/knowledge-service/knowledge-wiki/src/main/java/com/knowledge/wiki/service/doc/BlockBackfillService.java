package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.wiki.service.entity.PageCheckpoint;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PageHead;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.mapper.BlockBackfillMapper;
import com.knowledge.wiki.service.mapper.PageHeadMapper;
import com.knowledge.wiki.service.mapper.WikiBlockMapper;
import com.knowledge.wiki.service.service.IPageContentService;

import cn.hutool.core.collection.CollUtil;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * One-time migration of legacy {@code wiki_page_block} rows into the
 * block-authoritative tables, with per-page verification.
 * <p>
 * <b>Verification is not optional and does not pass quietly.</b> Every page is
 * round-tripped — reassembled, written, read back, reassembled again — and the
 * block count and full text of the two documents are compared. A page whose
 * round trip differs is reported for a human to look at, never logged at debug
 * and forgotten. A migration that reports "done" while having dropped a
 * paragraph is worse than one that refuses to finish.
 * </p>
 * <p>
 * <b>Idempotent.</b> A page that already has a {@code wiki_page_head} row is
 * skipped unless explicitly forced, so an interrupted run can simply be repeated.
 * </p>
 * <p>
 * <b>Ranks come from the legacy data where the legacy data has them.</b> The
 * document must read back in the order its author last saw it, so a stored
 * {@code attrs.rank} is preserved verbatim whenever it is still consistent with
 * its neighbours, and only regenerated when it is not — a collision or an
 * inversion, both of which the old model permitted and the new sibling unique key
 * does not.
 * </p>
 */
@Service
@Slf4j
public class BlockBackfillService {

    /** The rev every migrated page starts at. */
    private static final long INITIAL_REV = 1L;

    @Autowired
    private IPageContentService pageContentService;

    @Autowired
    private WikiBlockMapper wikiBlockMapper;

    @Autowired
    private PageHeadMapper pageHeadMapper;

    @Autowired
    private BlockBackfillMapper blockBackfillMapper;

    @Autowired
    private PageDocService pageDocService;

    /** How one page's migration turned out. */
    @Getter
    public static final class PageResult {

        public enum Status {
            /** Migrated and verified identical. */
            OK,
            /** Migrated, but the round trip does not match. Needs a human. */
            MISMATCH,
            /** Already had a head row; left alone. */
            SKIPPED_MIGRATED,
            /** No legacy rows. Nothing to migrate. */
            SKIPPED_EMPTY,
            /** Threw. Nothing was written for this page. */
            FAILED
        }

        private final Long pageId;

        private final Status status;

        private final int legacyRowCount;

        private final int blockCount;

        private final int roundTripBlockCount;

        private final int textLength;

        private final int roundTripTextLength;

        private final List<String> warnings;

        private final String error;

        PageResult(Long pageId, Status status, int legacyRowCount, int blockCount, int roundTripBlockCount,
                int textLength, int roundTripTextLength, List<String> warnings, String error) {
            this.pageId = pageId;
            this.status = status;
            this.legacyRowCount = legacyRowCount;
            this.blockCount = blockCount;
            this.roundTripBlockCount = roundTripBlockCount;
            this.textLength = textLength;
            this.roundTripTextLength = roundTripTextLength;
            this.warnings = warnings == null ? new ArrayList<>() : warnings;
            this.error = error;
        }

        static PageResult skipped(Long pageId, Status status) {
            return new PageResult(pageId, status, 0, 0, 0, 0, 0, null, null);
        }

        static PageResult failed(Long pageId, String error) {
            return new PageResult(pageId, Status.FAILED, 0, 0, 0, 0, 0, null, error);
        }

        /** True when the page needs a person to look at it before going live. */
        public boolean needsReview() {
            return status == Status.MISMATCH || status == Status.FAILED || !warnings.isEmpty();
        }
    }

    /** Totals for a whole sweep, plus the pages that need attention. */
    @Getter
    public static final class SweepReport {

        private final boolean dryRun;

        private int total;

        private int ok;

        private int mismatch;

        private int skipped;

        private int failed;

        private final List<PageResult> needsReview = new ArrayList<>();

        SweepReport(boolean dryRun) {
            this.dryRun = dryRun;
        }

        void record(PageResult result) {
            total++;
            switch (result.getStatus()) {
                case OK:
                    ok++;
                    break;
                case MISMATCH:
                    mismatch++;
                    break;
                case FAILED:
                    failed++;
                    break;
                default:
                    skipped++;
                    break;
            }
            if (result.needsReview()) {
                needsReview.add(result);
            }
        }
    }

    /**
     * Migrate every page that has legacy rows.
     *
     * @param dryRun when true, reassemble and verify but write nothing. The
     *               verification still runs — it just compares the rebuilt
     *               document against what would have been stored, rather than
     *               against what was.
     * @param force  re-migrate pages that already have a head row, replacing their
     *               {@code wiki_block} rows
     */
    public SweepReport backfillAll(boolean dryRun, boolean force) {
        List<Long> pageIds = blockBackfillMapper.selectLegacyPageIds();
        SweepReport report = new SweepReport(dryRun);
        log.info("block backfill starting: {} page(s), dryRun={} force={}", pageIds.size(), dryRun, force);

        for (Long pageId : pageIds) {
            PageResult result;
            try {
                result = backfillPage(pageId, dryRun, force);
            } catch (Exception e) {
                // One bad page must not stop the sweep; its transaction rolled back,
                // so it is simply still unmigrated and will be retried next run.
                log.error("block backfill failed: pageId={}", pageId, e);
                result = PageResult.failed(pageId, e.getMessage());
            }
            report.record(result);
        }

        logReport(report);
        return report;
    }

    /**
     * Migrate one page: reassemble its legacy tree, store it as blocks, set the
     * head to rev 1, and take an {@code IMPORT} checkpoint so the migrated state
     * is itself a restorable point in history.
     */
    @Transactional(rollbackFor = Exception.class)
    public PageResult backfillPage(Long pageId, boolean dryRun, boolean force) {
        if (pageId == null) {
            return PageResult.skipped(null, PageResult.Status.SKIPPED_EMPTY);
        }
        if (!force && pageHeadMapper.selectById(pageId) != null) {
            return PageResult.skipped(pageId, PageResult.Status.SKIPPED_MIGRATED);
        }

        List<PageContent> legacyRows = pageContentService.findByPageId(pageId);
        if (CollUtil.isEmpty(legacyRows)) {
            return PageResult.skipped(pageId, PageResult.Status.SKIPPED_EMPTY);
        }

        LegacyBlockReassembler.Reassembled rebuilt = LegacyBlockReassembler.reassemble(legacyRows);
        List<WikiBlock> rows = toBlockRows(pageId, rebuilt);

        // Verify against the rows themselves rather than against the database, so
        // dry-run and real runs check exactly the same thing. The database round
        // trip is checked separately below, after the write.
        Map<String, Object> roundTrip = BlockDocCodec.assemble(rows);
        String sourceText = BlockDocCodec.extractText(rebuilt.getDoc());
        String roundTripText = BlockDocCodec.extractText(roundTrip);

        if (!dryRun) {
            write(pageId, rows);
            // Now the real thing: read the JSON back out of the column. This is what
            // catches an encoding problem that an in-memory comparison cannot see.
            Map<String, Object> stored = pageDocService.readDoc(pageId).getDoc();
            roundTrip = stored;
            roundTripText = BlockDocCodec.extractText(stored);
        }

        int roundTripBlocks = BlockDocCodec.childrenOf(roundTrip).size();
        boolean matches = rows.size() == roundTripBlocks && sourceText.equals(roundTripText);

        return new PageResult(pageId, matches ? PageResult.Status.OK : PageResult.Status.MISMATCH,
                rebuilt.getLegacyRowCount(), rows.size(), roundTripBlocks, sourceText.length(),
                roundTripText.length(), rebuilt.getWarnings(), null);
    }

    // ------------------------------------------------------------------
    // Row construction
    // ------------------------------------------------------------------

    /**
     * Turn the rebuilt document into rows, using the same codec the live write
     * path uses.
     * <p>
     * Going through {@link BlockDocCodec#flatten} rather than building rows by hand
     * is the point: it guarantees a migrated page is byte-identical to what a save
     * of the same document would have produced. Anything else and the first
     * reconcile after switch-over would rewrite every block of every page for no
     * reason, burying any real change in the noise.
     * </p>
     */
    private List<WikiBlock> toBlockRows(Long pageId, LegacyBlockReassembler.Reassembled rebuilt) {
        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec.flatten(rebuilt.getDoc());
        Map<String, String> legacyRanks = rebuilt.getLegacyRanks();

        List<WikiBlock> rows = new ArrayList<>(flat.size());
        String previousRank = null;
        for (BlockDocCodec.FlatBlock block : flat) {
            String rank = nextRank(legacyRanks.get(block.getBlockId()), previousRank);
            previousRank = rank;

            WikiBlock row = new WikiBlock();
            row.setBlockId(block.getBlockId());
            row.setPageId(pageId);
            row.setParentId(BlockDocCodec.TOP_LEVEL);
            row.setBlockRank(rank);
            row.setType(block.getType());
            row.setNode(block.getNodeJson());
            row.setNodeHash(block.getNodeHash());
            row.setText(block.getText());
            row.setRev(INITIAL_REV);
            rows.add(row);
        }
        return rows;
    }

    /**
     * The legacy rank if it is still strictly greater than the previous block's,
     * otherwise a freshly generated key that is.
     * <p>
     * Legacy ranks could collide or invert — the old read path tolerated it by
     * tie-breaking on create time, the new sibling unique key does not. Keeping the
     * legacy value whenever it is consistent means most blocks migrate with the
     * exact rank they already had; regenerating only the inconsistent ones keeps
     * the resulting order identical to the order the legacy comparator produced,
     * because the blocks arrive here already sorted by it.
     * </p>
     * <p>
     * Package-private and static so the monotonicity it guarantees can be asserted
     * without a database: it is the only thing standing between legacy rank data and
     * a unique-key violation mid-migration.
     * </p>
     */
    static String nextRank(String legacyRank, String previousRank) {
        boolean usable = legacyRank != null && !legacyRank.isEmpty()
                && (previousRank == null || legacyRank.compareTo(previousRank) > 0);
        return usable ? legacyRank : FractionalIndex.keyBetween(previousRank, null);
    }

    // ------------------------------------------------------------------
    // Writing
    // ------------------------------------------------------------------

    private void write(Long pageId, List<WikiBlock> rows) {
        // A forced re-migration replaces the page wholesale. Deleting first is what
        // makes the operation repeatable: without it, a page whose block set shrank
        // would keep the blocks that are no longer in the document.
        wikiBlockMapper.delete(Wrappers.<WikiBlock>lambdaQuery().eq(WikiBlock::getPageId, pageId));

        for (WikiBlock row : rows) {
            wikiBlockMapper.insert(row);
        }

        upsertHead(pageId);

        // An IMPORT checkpoint at rev 1 gives every migrated page a restorable
        // baseline. Without it the earliest state the history could offer would be
        // whatever the first post-migration edit happened to leave behind.
        pageDocService.writeCheckpoint(pageId, INITIAL_REV, null, PageCheckpoint.KIND_IMPORT, "迁移基线");
    }

    private void upsertHead(Long pageId) {
        PageHead head = new PageHead();
        head.setPageId(pageId);
        head.setRev(INITIAL_REV);
        head.setUpdatedAt(LocalDateTime.now());
        if (pageHeadMapper.selectById(pageId) == null) {
            pageHeadMapper.insert(head);
        } else {
            pageHeadMapper.updateById(head);
        }
    }

    // ------------------------------------------------------------------
    // Reporting
    // ------------------------------------------------------------------

    private void logReport(SweepReport report) {
        log.info("block backfill finished{}: total={} ok={} mismatch={} skipped={} failed={}",
                report.isDryRun() ? " (dry run, nothing written)" : "", report.getTotal(), report.getOk(),
                report.getMismatch(), report.getSkipped(), report.getFailed());

        if (report.getNeedsReview().isEmpty()) {
            return;
        }
        // Listed individually and at warn level on purpose. These are the pages the
        // plan requires to be handed to a person rather than passed silently.
        log.warn("block backfill: {} page(s) need manual review", report.getNeedsReview().size());
        for (PageResult result : report.getNeedsReview()) {
            log.warn("  pageId={} status={} legacyRows={} blocks={}/{} textLen={}/{} error={} warnings={}",
                    result.getPageId(), result.getStatus(), result.getLegacyRowCount(), result.getBlockCount(),
                    result.getRoundTripBlockCount(), result.getTextLength(), result.getRoundTripTextLength(),
                    result.getError(), result.getWarnings());
        }
    }

    /** The review list as a serialisable map, for callers that want it as data. */
    public static List<Map<String, Object>> reviewList(SweepReport report) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PageResult result : report.getNeedsReview()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", result.getPageId());
            row.put("status", result.getStatus().name());
            row.put("legacyRowCount", result.getLegacyRowCount());
            row.put("blockCount", result.getBlockCount());
            row.put("roundTripBlockCount", result.getRoundTripBlockCount());
            row.put("textLength", result.getTextLength());
            row.put("roundTripTextLength", result.getRoundTripTextLength());
            row.put("warnings", result.getWarnings());
            row.put("error", result.getError());
            out.add(row);
        }
        return out;
    }

}
