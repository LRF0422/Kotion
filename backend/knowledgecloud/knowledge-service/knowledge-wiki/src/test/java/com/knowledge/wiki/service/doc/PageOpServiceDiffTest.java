package com.knowledge.wiki.service.doc;

import static com.knowledge.wiki.service.doc.BlockDocCodecTest.doc;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.paragraph;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.store;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.titleNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.dto.BlockOpDTO;

/**
 * Reconcile's diff, which is the main defence against the duplication bug.
 * <p>
 * The bug it replaces worked like this: a client decided from its own local state
 * whether to copy DB content into the shared document, two clients both decided
 * yes, and the merge kept both copies. The fix is not "decide more carefully" —
 * it is that convergence is <b>keyed on block id</b>, so applying the same
 * document twice cannot produce two of anything.
 * </p>
 * <p>
 * {@link #alignedDocumentProducesNoOps()} is the assertion that matters most: if
 * it ever fails, the seeding bug is back in a new costume.
 * </p>
 */
class PageOpServiceDiffTest {

    /**
     * An already-aligned document must produce an empty op list — no inserts, no
     * moves, no replaces, no deletes. An empty list is what makes the batch skip
     * the rev bump and the journal write, which is what makes reconcile free to
     * call on every uncertain path.
     */
    @Test
    void alignedDocumentProducesNoOps() {
        Map<String, Object> document = doc(Arrays.asList(
                titleNode("t1", "标题"),
                paragraph("p1", "第一段"),
                paragraph("p2", "第二段")));
        List<WikiBlock> stored = store(document);

        assertTrue(PageOpService.diffToOps(document, stored).isEmpty(), "已对齐的文档必须产生零 op");
    }

    /** Running the diff twice against the same state must give the same answer. */
    @Test
    void diffIsStableAcrossRepeatedCalls() {
        Map<String, Object> document = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "内容")));
        List<WikiBlock> stored = store(document);

        assertEquals(PageOpService.diffToOps(document, stored).size(),
                PageOpService.diffToOps(document, stored).size());
    }

    /**
     * The scenario that used to double a page: content exists only in the database
     * and a client submits the same document back. Every block must be recognised,
     * so the diff is empty rather than a second insert of everything.
     */
    @Test
    void resubmittingDatabaseContentInsertsNothing() {
        Map<String, Object> document = doc(Arrays.asList(
                titleNode("t1", "会重复的标题"),
                paragraph("p1", "正文")));
        List<WikiBlock> stored = store(document);

        List<BlockOpDTO> ops = PageOpService.diffToOps(document, stored);

        assertEquals(0, countOf(ops, BlockOpDTO.OP_INSERT));
        assertEquals(0, ops.size());
    }

    @Test
    void newBlockBecomesAnInsertAnchoredAfterItsPredecessor() {
        Map<String, Object> before = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "第一段")));
        List<WikiBlock> stored = store(before);
        Map<String, Object> after = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "第一段"), paragraph("p2", "新增的段")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(after, stored);

        assertEquals(1, ops.size());
        BlockOpDTO op = ops.get(0);
        assertEquals(BlockOpDTO.OP_INSERT, op.getOp());
        assertEquals("p2", op.getBlockId());
        assertEquals(BlockOpDTO.POS_AFTER, op.getPos());
        assertEquals("p1", op.getRefBlockId());
    }

    @Test
    void changedContentBecomesAReplaceAndNothingElse() {
        Map<String, Object> before = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "改之前")));
        List<WikiBlock> stored = store(before);
        Map<String, Object> after = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "改之后")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(after, stored);

        assertEquals(1, ops.size());
        assertEquals(BlockOpDTO.OP_REPLACE, ops.get(0).getOp());
        assertEquals("p1", ops.get(0).getBlockId());
        assertEquals(0, countOf(ops, BlockOpDTO.OP_MOVE), "只改内容不应带出 move");
    }

    @Test
    void removedBlockBecomesADelete() {
        Map<String, Object> before = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "留下"), paragraph("p2", "删掉")));
        List<WikiBlock> stored = store(before);
        Map<String, Object> after = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "留下")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(after, stored);

        assertEquals(1, ops.size());
        assertEquals(BlockOpDTO.OP_DELETE, ops.get(0).getOp());
        assertEquals("p2", ops.get(0).getBlockId());
    }

    /** Reordering emits moves and no content writes. */
    @Test
    void reorderingBecomesMovesWithoutReplaces() {
        Map<String, Object> before = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "甲"), paragraph("p2", "乙"), paragraph("p3", "丙")));
        List<WikiBlock> stored = store(before);
        Map<String, Object> after = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p3", "丙"), paragraph("p1", "甲"), paragraph("p2", "乙")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(after, stored);

        assertEquals(0, countOf(ops, BlockOpDTO.OP_REPLACE), "顺序变化不得夹带内容写入");
        assertEquals(0, countOf(ops, BlockOpDTO.OP_DELETE));
        assertTrue(countOf(ops, BlockOpDTO.OP_MOVE) > 0);
    }

    /**
     * One drag must cost one move, in either direction.
     * <p>
     * The naive rule — keep a block only if its rank exceeds the last one kept —
     * passes this downwards and fails it upwards, because the first block of the
     * desired sequence always trivially qualifies and everything the dragged block
     * jumped over then has to move instead. On a long page that is the difference
     * between a one-op batch and a batch proportional to page length, and between a
     * history entry saying "this block moved" and one saying the page was rewritten.
     * </p>
     */
    @Test
    void draggingABlockUpwardsCostsExactlyOneMove() {
        List<Map<String, Object>> body = paragraphs(40);
        List<WikiBlock> stored = store(doc(body));

        List<Map<String, Object>> reordered = new ArrayList<>(body);
        reordered.add(0, reordered.remove(body.size() - 1));

        List<BlockOpDTO> ops = PageOpService.diffToOps(doc(reordered), stored);

        assertEquals(1, countOf(ops, BlockOpDTO.OP_MOVE), "向上拖一个块只应产生一个 move，实际 op: " + ops.size());
        assertEquals(1, ops.size(), "不得夹带其他 op");
        assertEquals("p39", ops.get(0).getBlockId(), "移动的必须是被拖的那个块，而不是它跳过的邻居");
        assertEquals(BlockOpDTO.POS_FIRST_CHILD, ops.get(0).getPos(), "拖到首位无前驱可锚定");
        // 顶层的哨兵是空 parentId，不是 "root" 之类的名字：任何编造的名字都会被当成
        // 真实存在的父块解析，块会被挂到一个不存在的父下、从文档里消失。前端 deriveOps
        // 对应地不设置 parentId，两边靠这条断言保持一致。
        assertEquals(BlockDocCodec.TOP_LEVEL,
                PageBlockIndex.normaliseParent(ops.get(0).getParentId()),
                "firstChild 的 parentId 必须归一化为顶层哨兵");
    }

    @Test
    void draggingABlockDownwardsCostsExactlyOneMove() {
        List<Map<String, Object>> body = paragraphs(40);
        List<WikiBlock> stored = store(doc(body));

        List<Map<String, Object>> reordered = new ArrayList<>(body);
        reordered.add(reordered.remove(0));

        List<BlockOpDTO> ops = PageOpService.diffToOps(doc(reordered), stored);

        assertEquals(1, ops.size(), "向下拖一个块只应产生一个 op");
        assertEquals(BlockOpDTO.OP_MOVE, ops.get(0).getOp());
        assertEquals("p0", ops.get(0).getBlockId());
        assertEquals("p39", ops.get(0).getRefBlockId());
    }

    /** A duplicated block id in the incoming document converges, not duplicates. */
    @Test
    void duplicateIdInIncomingDocumentDoesNotInsertTwice() {
        Map<String, Object> stored = doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "正文")));
        List<WikiBlock> rows = store(stored);
        Map<String, Object> incoming = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "正文"), paragraph("p1", "同 id 的第二份")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(incoming, rows);

        assertEquals(0, countOf(ops, BlockOpDTO.OP_INSERT), "重复 id 不得变成一次新增");
    }

    /** An empty incoming document deletes everything rather than doing nothing. */
    @Test
    void emptyDocumentDeletesEveryBlock() {
        List<WikiBlock> stored = store(doc(Arrays.asList(titleNode("t1", "标题"), paragraph("p1", "正文"))));

        List<BlockOpDTO> ops = PageOpService.diffToOps(doc(new ArrayList<>()), stored);

        assertEquals(2, ops.size());
        assertEquals(2, countOf(ops, BlockOpDTO.OP_DELETE));
    }

    /** A page with no rows yet takes the whole document as inserts. */
    @Test
    void emptyStoreInsertsEverythingInOrder() {
        Map<String, Object> document = doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "甲"), paragraph("p2", "乙")));

        List<BlockOpDTO> ops = PageOpService.diffToOps(document, new ArrayList<>());

        assertEquals(3, ops.size());
        assertEquals(3, countOf(ops, BlockOpDTO.OP_INSERT));
        assertEquals(BlockOpDTO.POS_FIRST_CHILD, ops.get(0).getPos());
        assertEquals("t1", ops.get(1).getRefBlockId());
        assertEquals("p1", ops.get(2).getRefBlockId());
    }

    private static int countOf(List<BlockOpDTO> ops, String kind) {
        int count = 0;
        for (BlockOpDTO op : ops) {
            if (kind.equals(op.getOp())) {
                count++;
            }
        }
        return count;
    }

    /** {@code count} paragraphs named {@code p0..p{count-1}}. */
    private static List<Map<String, Object>> paragraphs(int count) {
        List<Map<String, Object>> body = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            body.add(paragraph("p" + i, "第 " + i + " 段"));
        }
        return body;
    }

}
