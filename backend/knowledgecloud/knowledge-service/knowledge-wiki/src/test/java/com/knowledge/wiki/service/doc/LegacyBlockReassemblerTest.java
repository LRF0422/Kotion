package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.Mark;
import com.knowledge.wiki.service.entity.PageContent;

import cn.hutool.json.JSONObject;

/**
 * The one-shot migration reassembler.
 * <p>
 * This is the only test that proves the backfill <b>recovers</b> content rather
 * than inheriting the old model's damage.
 * {@link #inlineContentIsMergedWithChildRowsNotReplacedByThem()} is the reason
 * the class exists at all: the legacy read path assigned
 * {@code node.setContent(childRows)}, so any container that held real text
 * <em>and</em> had id-bearing children extracted into their own rows lost the
 * text on every read. Migrating through that code would have made the loss
 * permanent.
 * </p>
 * <p>
 * The ordering tests matter for a subtler reason: a migration that silently
 * reorders a document is indistinguishable from data loss to the person who
 * wrote it. Order must come out of the legacy keys, not be recomputed.
 * </p>
 */
class LegacyBlockReassemblerTest {

    // ------------------------------------------------------------------
    // The defect this class exists to undo
    // ------------------------------------------------------------------

    /**
     * A container that is <b>not</b> on the legacy inline whitelist, holding both
     * stored inline text and an extracted child row. Both must survive, and the
     * page must be flagged, because the original interleaving of the two was never
     * persisted and therefore cannot be reconstructed.
     */
    @Test
    void inlineContentIsMergedWithChildRowsNotReplacedByThem() {
        PageContent callout = row("co1", "callout", null, 0);
        callout.setContent(Arrays.asList(inlineText("提示：")));
        PageContent child = row("p1", "paragraph", "co1", 0);
        child.setContent(Arrays.asList(inlineText("被抽走的段落")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(callout, child));

        String text = BlockDocCodec.extractText(result.getDoc());
        assertTrue(text.contains("提示："), "容器自身的内联文本必须保留，实际: " + text);
        assertTrue(text.contains("被抽走的段落"), "被抽走成子行的内容必须回到父节点里，实际: " + text);
        assertFalse(result.getWarnings().isEmpty(), "内联内容与子行并存必须留下警告，不能静默拼接");
    }

    /**
     * A child that is present <em>both</em> inside the parent's content column and
     * as a row of its own must appear once. Convergence is by dropping the copy —
     * renaming it would turn one repairable duplicate into two legitimate blocks.
     */
    @Test
    void childPresentInBothPlacesAppearsOnce() {
        PageContent quote = row("bq1", "blockquote", null, 0);
        PageContent storedCopy = inline("p1", "paragraph");
        storedCopy.setContent(Arrays.asList(inlineText("正文")));
        quote.setContent(Arrays.asList(storedCopy));

        PageContent rowCopy = row("p1", "paragraph", "bq1", 0);
        rowCopy.setContent(Arrays.asList(inlineText("正文")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(quote, rowCopy));

        assertEquals("正文", BlockDocCodec.extractText(result.getDoc()), "重复的一份必须被丢弃，不得拼成两遍");
        assertEquals(1, childrenOf(topLevel(result, 0)).size());
    }

    /** A nested subtree ends up inside its depth-1 ancestor's node, not beside it. */
    @Test
    void nestedRowsAreFoldedIntoTheirTopLevelAncestor() {
        PageContent list = row("ul1", "bulletList", null, 0);
        PageContent item = row("li1", "listItem", "ul1", 0);
        PageContent paragraph = row("li1p", "paragraph", "li1", 0);
        paragraph.setContent(Arrays.asList(inlineText("列表项")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(paragraph, list, item));

        assertEquals(1, result.getTopLevelCount(), "只有 bulletList 是顶层块");
        assertEquals(3, result.getLegacyRowCount());
        Map<String, Object> ul = topLevel(result, 0);
        Map<String, Object> li = childrenOf(ul).get(0);
        assertEquals("listItem", li.get("type"));
        assertEquals("paragraph", childrenOf(li).get(0).get("type"));
        assertEquals("列表项", BlockDocCodec.extractText(result.getDoc()));
    }

    // ------------------------------------------------------------------
    // Ordering
    // ------------------------------------------------------------------

    /** A stored {@code attrs.rank} is carried over verbatim, never recomputed. */
    @Test
    void storedLegacyRankIsPreserved() {
        PageContent title = row("t1", "title", null, 0);
        title.setAttrs(attrs("rank", "b"));
        PageContent paragraph = row("p1", "paragraph", null, 0);
        paragraph.setAttrs(attrs("rank", "m"));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(paragraph, title));

        assertEquals("b", result.getLegacyRanks().get("t1"));
        assertEquals("m", result.getLegacyRanks().get("p1"));
    }

    /** Rank order decides the document order, whatever order the rows arrive in. */
    @Test
    void topLevelOrderFollowsStoredRank() {
        PageContent first = withRank(row("a", "paragraph", null, 0), "b");
        PageContent second = withRank(row("b", "paragraph", null, 0), "m");
        PageContent third = withRank(row("c", "paragraph", null, 0), "t");

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(third, first, second));

        assertEquals(Arrays.asList("a", "b", "c"), topLevelIds(result));
    }

    /**
     * Rows written before ranks existed fall back to {@code sort_order}, and the
     * derived keys must reproduce the integer order exactly.
     */
    @Test
    void sortOrderIsTheFallbackWhenRankIsMissing() {
        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler.reassemble(Arrays.asList(
                row("c", "paragraph", null, 2),
                row("a", "paragraph", null, 0),
                row("b", "paragraph", null, 1)));

        assertEquals(Arrays.asList("a", "b", "c"), topLevelIds(result));
    }

    /** Siblings inside a subtree keep their {@code sort_order} sequence. */
    @Test
    void siblingOrderFollowsSortOrder() {
        PageContent quote = row("bq1", "blockquote", null, 0);
        PageContent second = row("p2", "paragraph", "bq1", 1);
        second.setContent(Arrays.asList(inlineText("乙")));
        PageContent first = row("p1", "paragraph", "bq1", 0);
        first.setContent(Arrays.asList(inlineText("甲")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(quote, second, first));

        assertEquals("甲乙", BlockDocCodec.extractText(result.getDoc()));
    }

    // ------------------------------------------------------------------
    // Convergence
    // ------------------------------------------------------------------

    /**
     * Several root titles is the visible symptom of the seeding race. Migration
     * collapses them to one and keeps the one the legacy read path showed users, so
     * the migration itself does not change what anybody sees.
     */
    @Test
    void multipleRootTitlesCollapseToTheOneUsersWereSeeing() {
        PageContent blank = row("t1", "title", null, 0);
        blank.setUpdateTime(LocalDateTime.of(2024, 1, 1, 0, 0));
        PageContent real = row("t2", "title", null, 1);
        real.setText("真正的标题");
        real.setUpdateTime(LocalDateTime.of(2024, 6, 1, 0, 0));
        PageContent body = row("p1", "paragraph", null, 2);
        body.setContent(Arrays.asList(inlineText("正文")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(blank, real, body));

        assertEquals(Arrays.asList("t2", "p1"), topLevelIds(result), "有文本的标题胜出，其余丢弃");
        assertFalse(result.getWarnings().isEmpty(), "丢弃标题必须留下警告");
    }

    /** The surviving title is moved to the front, as the schema requires. */
    @Test
    void titleIsHoistedAheadOfBody() {
        PageContent body = withRank(row("p1", "paragraph", null, 0), "b");
        PageContent title = withRank(row("t1", "title", null, 0), "t");
        title.setText("标题");

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(body, title));

        assertEquals(Arrays.asList("t1", "p1"), topLevelIds(result));
    }

    /**
     * A row whose {@code parent_id} names a row that does not exist has no position
     * to be placed in. Inventing one would be a guess about content, so it is
     * dropped — and listed, because a dropped block is exactly what a human needs
     * to be told about.
     */
    @Test
    void orphanRowsAreDroppedAndReported() {
        PageContent kept = row("p1", "paragraph", null, 0);
        kept.setContent(Arrays.asList(inlineText("留下")));
        PageContent orphan = row("p2", "paragraph", "不存在的父块", 0);
        orphan.setContent(Arrays.asList(inlineText("孤儿")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(kept, orphan));

        assertEquals(Arrays.asList("p2"), result.getOrphanBlockIds());
        assertEquals("留下", BlockDocCodec.extractText(result.getDoc()));
        assertFalse(result.getWarnings().isEmpty());
    }

    /** Colliding rows converge on the newer one by version, then by update time. */
    @Test
    void duplicateRowsConvergeOnTheNewerOne() {
        PageContent older = row("p1", "paragraph", null, 0);
        older.setVersion(1);
        older.setContent(Arrays.asList(inlineText("旧内容")));
        PageContent newer = row("p1", "paragraph", null, 0);
        newer.setVersion(7);
        newer.setContent(Arrays.asList(inlineText("新内容")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(older, newer));

        assertEquals(1, result.getTopLevelCount());
        assertEquals("新内容", BlockDocCodec.extractText(result.getDoc()));
        assertFalse(result.getWarnings().isEmpty());
    }

    // ------------------------------------------------------------------
    // Identity and fidelity
    // ------------------------------------------------------------------

    /**
     * {@code attrs.id} is pinned to the primary key. Rows written before the
     * identity repair can be missing it, and a node with no id makes the editor
     * mint a fresh one — which forks a duplicate block on the very next save.
     */
    @Test
    void attrsIdIsPinnedToThePrimaryKeyEvenWhenAbsent() {
        PageContent paragraph = row("p1", "paragraph", null, 0);
        paragraph.setAttrs(attrs("textAlign", "center"));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(paragraph));

        Map<String, Object> node = topLevel(result, 0);
        assertEquals("p1", attrsOf(node).get("id"));
        assertEquals("center", attrsOf(node).get("textAlign"), "其余 attrs 必须原样保留");
    }

    /** A stale {@code attrs.id} disagreeing with the PK loses to the PK. */
    @Test
    void primaryKeyWinsOverAStaleAttrsId() {
        PageContent paragraph = row("p1", "paragraph", null, 0);
        paragraph.setAttrs(attrs("id", "对不上的旧id"));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(paragraph));

        assertEquals("p1", attrsOf(topLevel(result, 0)).get("id"));
    }

    /** Marks on stored inline content come through the migration intact. */
    @Test
    void marksSurviveReassembly() {
        PageContent paragraph = row("p1", "paragraph", null, 0);
        PageContent bold = inlineText("加粗的字");
        Mark mark = new Mark();
        mark.setType("bold");
        bold.setMarks(Arrays.asList(mark));
        paragraph.setContent(Arrays.asList(bold));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(paragraph));

        Map<String, Object> textNode = childrenOf(topLevel(result, 0)).get(0);
        assertEquals("加粗的字", textNode.get("text"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> marks = (List<Map<String, Object>>) textNode.get("marks");
        assertEquals("bold", marks.get(0).get("type"));
    }

    /** Rows with no usable type or id are skipped rather than producing junk nodes. */
    @Test
    void unusableRowsAreSkipped() {
        PageContent typeless = row("x1", null, null, 0);
        PageContent idless = row(null, "paragraph", null, 0);
        PageContent good = row("p1", "paragraph", null, 0);
        good.setContent(Arrays.asList(inlineText("正文")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(typeless, idless, good));

        assertEquals(Arrays.asList("p1"), topLevelIds(result));
    }

    @Test
    void noRowsProducesAnEmptyDoc() {
        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler.reassemble(new ArrayList<>());

        assertEquals("doc", result.getDoc().get("type"));
        assertEquals(0, result.getTopLevelCount());
        assertTrue(result.getWarnings().isEmpty());
    }

    /**
     * The whole point of the migration: what the reassembler produces must go
     * through the new write/read path without losing a character. If this fails,
     * the migration writes rows that read back differently from what it read.
     */
    @Test
    void reassembledDocumentSurvivesTheNewWritePath() {
        PageContent title = withRank(row("t1", "title", null, 0), "b");
        title.setText("标题");
        PageContent callout = withRank(row("co1", "callout", null, 1), "m");
        callout.setContent(Arrays.asList(inlineText("提示：")));
        PageContent child = row("p1", "paragraph", "co1", 0);
        child.setContent(Arrays.asList(inlineText("正文")));

        LegacyBlockReassembler.Reassembled result = LegacyBlockReassembler
                .reassemble(Arrays.asList(title, callout, child));

        String before = BlockDocCodec.extractText(result.getDoc());
        Map<String, Object> after = BlockDocCodec.assemble(BlockDocCodecTest.store(result.getDoc()));

        assertEquals(before, BlockDocCodec.extractText(after), "迁移产物经过新读写路径必须逐字一致");
        assertEquals(result.getTopLevelCount(), BlockDocCodec.childrenOf(after).size());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static PageContent row(String id, String type, String parentId, int sortOrder) {
        PageContent row = new PageContent();
        row.setId(id);
        row.setType(type);
        row.setParentId(parentId);
        row.setSortOrder(sortOrder);
        row.setPageId(1L);
        return row;
    }

    private static PageContent withRank(PageContent row, String rank) {
        row.setAttrs(attrs("rank", rank));
        return row;
    }

    /** A node that only ever lived inside a parent's content column. */
    private static PageContent inline(String id, String type) {
        PageContent node = new PageContent();
        node.setId(id);
        node.setType(type);
        node.setAttrs(attrs("id", id));
        return node;
    }

    private static PageContent inlineText(String text) {
        PageContent node = new PageContent();
        node.setType("text");
        node.setText(text);
        return node;
    }

    private static JSONObject attrs(String key, String value) {
        JSONObject attrs = new JSONObject();
        attrs.set(key, value);
        return attrs;
    }

    private static Map<String, Object> topLevel(LegacyBlockReassembler.Reassembled result, int index) {
        return BlockDocCodec.childrenOf(result.getDoc()).get(index);
    }

    private static List<Map<String, Object>> childrenOf(Map<String, Object> node) {
        return BlockDocCodec.childrenOf(node);
    }

    private static List<String> topLevelIds(LegacyBlockReassembler.Reassembled result) {
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> node : BlockDocCodec.childrenOf(result.getDoc())) {
            ids.add(BlockDocCodec.readBlockId(node));
        }
        return ids;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> attrsOf(Map<String, Object> node) {
        return (Map<String, Object>) node.get("attrs");
    }

}
