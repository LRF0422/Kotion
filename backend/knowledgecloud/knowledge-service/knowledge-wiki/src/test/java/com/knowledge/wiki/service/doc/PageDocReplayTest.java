package com.knowledge.wiki.service.doc;

import static com.knowledge.wiki.service.doc.BlockDocCodecTest.doc;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.paragraph;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.titleNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.PageOp;
import com.knowledge.wiki.service.entity.dto.BlockOpDTO;

class PageDocReplayTest {

    @Test
    void replaysServerRanksContentAndDeletesDeterministically() {
        List<PageOp> journal = Arrays.asList(
                entry(1L,
                        insert("t1", "a", titleNode("t1", "标题")),
                        insert("p1", "c", paragraph("p1", "旧内容"))),
                entry(2L, replace("p1", paragraph("p1", "新内容"))),
                entry(3L, insert("p2", "b", paragraph("p2", "中间"))),
                entry(4L, delete("p1")));

        Map<String, Object> result = PageDocReplay.replay(doc(new ArrayList<>()), journal);
        List<Map<String, Object>> blocks = BlockDocCodec.childrenOf(result);

        assertEquals(2, blocks.size());
        assertEquals("t1", BlockDocCodec.readBlockId(blocks.get(0)));
        assertEquals("p2", BlockDocCodec.readBlockId(blocks.get(1)));
        assertEquals("标题中间", BlockDocCodec.extractText(result));
    }

    @Test
    void moveUsesNormalisedRankRatherThanRecomputingPlacement() {
        Map<String, Object> base = BlockDocCodec.assemble(BlockDocCodecTest.store(doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "甲"), paragraph("p2", "乙")))));
        Map<String, Object> move = op(BlockOpDTO.OP_MOVE, "p2");
        move.put("parentId", BlockDocCodec.TOP_LEVEL);
        move.put("rank", "0");

        Map<String, Object> result = PageDocReplay.replay(base, Arrays.asList(entry(2L, move)));

        assertEquals("p2", BlockDocCodec.readBlockId(BlockDocCodec.childrenOf(result).get(1)),
                "title is hoisted, then the server rank decides body order");
    }

    @Test
    void rejectsJournalThatReferencesMissingBlock() {
        assertThrows(RuntimeException.class,
                () -> PageDocReplay.replay(doc(new ArrayList<>()),
                        Arrays.asList(entry(1L, replace("missing", paragraph("missing", "x"))))));
    }

    @Test
    void materializationRequiresAContinuousRevRange() {
        assertThrows(RuntimeException.class,
                () -> PageDocCommandService.validateReplayRange(1L, 3L, Arrays.asList(entry(3L, delete("p1")))));
    }

    private static PageOp entry(Long rev, Map<String, Object>... ops) {
        PageOp entry = new PageOp();
        entry.setPageId(1L);
        entry.setRev(rev);
        entry.setOps(BlockDocCodec.writeJson(Arrays.asList(ops)));
        entry.setCreatedAt(LocalDateTime.now());
        return entry;
    }

    private static Map<String, Object> insert(String blockId, String rank, Map<String, Object> node) {
        Map<String, Object> op = op(BlockOpDTO.OP_INSERT, blockId);
        op.put("parentId", BlockDocCodec.TOP_LEVEL);
        op.put("rank", rank);
        op.put("node", node);
        return op;
    }

    private static Map<String, Object> replace(String blockId, Map<String, Object> node) {
        Map<String, Object> op = op(BlockOpDTO.OP_REPLACE, blockId);
        op.put("node", node);
        return op;
    }

    private static Map<String, Object> delete(String blockId) {
        return op(BlockOpDTO.OP_DELETE, blockId);
    }

    private static Map<String, Object> op(String kind, String blockId) {
        Map<String, Object> op = new LinkedHashMap<>();
        op.put("op", kind);
        op.put("blockId", blockId);
        return op;
    }
}
