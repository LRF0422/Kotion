package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.WikiBlock;

/**
 * Document/row translation, and the invariants the old model kept breaking.
 * <p>
 * The most important test here is
 * {@link #inlineContentSurvivesRoundTripForEveryContainerType()}. The defect it
 * guards against was structural, not a coding slip: the old model gave every
 * id-bearing node its own row and rebuilt containers from those rows, which
 * discarded whatever inline content the container itself held. Storing each
 * depth-1 node's whole subtree is what makes that class of loss impossible, and
 * this test is the statement of that claim.
 * </p>
 */
class BlockDocCodecTest {

    // ------------------------------------------------------------------
    // Inline fidelity
    // ------------------------------------------------------------------

    /**
     * Every container type, including ones the legacy whitelist did not cover,
     * must survive a write/read round trip with its inline content untouched.
     */
    @Test
    void inlineContentSurvivesRoundTripForEveryContainerType() {
        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(titleNode("t1", "标题"));
        blocks.add(paragraph("p1", "普通段落"));
        blocks.add(node("blockquote", "bq1", Arrays.asList(paragraph("bq1p", "引用里的段落"))));
        blocks.add(node("bulletList", "ul1",
                Arrays.asList(node("listItem", "li1", Arrays.asList(paragraph("li1p", "列表项文本"))))));
        blocks.add(node("codeBlock", "cb1", Arrays.asList(text("const a = 1;"))));
        // A container that was never on the legacy whitelist but does hold inline
        // content directly. This is precisely the shape the old read path destroyed.
        blocks.add(node("callout", "co1", Arrays.asList(text("提示："), markedText("重点", "bold"))));
        blocks.add(node("table", "tb1", Arrays.asList(node("tableRow", "tr1",
                Arrays.asList(node("tableCell", "tc1", Arrays.asList(paragraph("tc1p", "单元格")))))))); 

        Map<String, Object> doc = doc(blocks);
        String textBefore = BlockDocCodec.extractText(doc);

        Map<String, Object> after = BlockDocCodec.assemble(store(doc));

        assertEquals(textBefore, BlockDocCodec.extractText(after), "全文文本必须逐字一致");
        assertEquals(blocks.size(), BlockDocCodec.childrenOf(after).size());
    }

    /** Marks and nested attrs come back byte-identical, not merely text-identical. */
    @Test
    void marksAndAttrsSurviveRoundTrip() {
        Map<String, Object> link = markedText("链接文字", "link");
        @SuppressWarnings("unchecked")
        Map<String, Object> mark = (Map<String, Object>) ((List<Object>) link.get("marks")).get(0);
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("href", "https://example.com");
        attrs.put("target", "_blank");
        mark.put("attrs", attrs);

        Map<String, Object> doc = doc(Arrays.asList(node("paragraph", "p1", Arrays.asList(link))));
        Map<String, Object> after = BlockDocCodec.assemble(store(doc));

        Map<String, Object> paragraph = BlockDocCodec.childrenOf(after).get(0);
        Map<String, Object> textNode = BlockDocCodec.childrenOf(paragraph).get(0);
        assertEquals(link.get("marks").toString(), textNode.get("marks").toString());
    }

    @Test
    void structuredSourceStringsSurviveRoundTripByteForByte() {
        String mermaidSource = "sequenceDiagram\nAlice->>John: Hi\nJohn-->>Alice: Hello\nAnimal <|-- Dog";
        String codeSource = "const keep = value => value > 0; // literal &gt;";
        Map<String, Object> mermaid = node("mermaid", "m1", null);
        attrsOf(mermaid).put("data", mermaidSource);
        Map<String, Object> codeBlock = node("codeBlock", "cb1", Arrays.asList(text(codeSource)));

        Map<String, Object> after = BlockDocCodec.assemble(store(doc(Arrays.asList(mermaid, codeBlock))));
        Map<String, Object> restoredMermaid = BlockDocCodec.childrenOf(after).get(0);
        Map<String, Object> restoredCodeBlock = BlockDocCodec.childrenOf(after).get(1);

        assertEquals(mermaidSource, attrsOf(restoredMermaid).get("data"));
        assertEquals(codeSource, BlockDocCodec.childrenOf(restoredCodeBlock).get(0).get("text"));
    }

    // ------------------------------------------------------------------
    // Identity convergence
    // ------------------------------------------------------------------

    /**
     * A duplicate id must be resolved by dropping the copy, never by renaming it.
     * Renaming turns one repairable duplicate into two legitimate blocks, which no
     * later pass can tell apart.
     */
    @Test
    void duplicateIdsConvergeByDroppingNotRenaming() {
        Map<String, Object> doc = doc(Arrays.asList(
                titleNode("t1", "标题"),
                paragraph("dup", "第一份"),
                paragraph("dup", "第二份")));

        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec.flatten(doc);

        assertEquals(2, flat.size(), "重复的那一份应当被丢弃");
        List<String> ids = new ArrayList<>();
        flat.forEach(block -> ids.add(block.getBlockId()));
        assertEquals(Arrays.asList("t1", "dup"), ids, "留下的 id 必须原样保留，不得改名");
        assertEquals("第一份", flat.get(1).getText());
    }

    /** An id-less node gets one minted — assignment at creation, not regeneration. */
    @Test
    void missingIdIsMinted() {
        Map<String, Object> paragraph = new LinkedHashMap<>();
        paragraph.put("type", "paragraph");
        paragraph.put("content", Arrays.asList(text("无 id 的段落")));

        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec.flatten(doc(Arrays.asList(paragraph)));

        assertEquals(1, flat.size());
        assertTrue(flat.get(0).getBlockId() != null && !flat.get(0).getBlockId().isEmpty());
    }

    /** An existing id is never rewritten, however the node is shaped. */
    @Test
    void existingIdIsPreserved() {
        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec
                .flatten(doc(Arrays.asList(paragraph("stable-id", "内容"))));
        assertEquals("stable-id", flat.get(0).getBlockId());
    }

    /** The schema is {@code doc = title block*}: extra titles are dropped. */
    @Test
    void extraTitlesAreDropped() {
        Map<String, Object> doc = doc(Arrays.asList(
                titleNode("t1", "第一个标题"),
                titleNode("t2", "第二个标题"),
                paragraph("p1", "正文")));

        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec.flatten(doc);

        assertEquals(2, flat.size());
        assertEquals("t1", flat.get(0).getBlockId());
        assertEquals("p1", flat.get(1).getBlockId());
    }

    /** A title that is not first in rank order is hoisted on read. */
    @Test
    void titleIsHoistedToTheFront() {
        List<WikiBlock> rows = Arrays.asList(
                row("p1", "paragraph", "a", paragraph("p1", "正文")),
                row("t1", "title", "b", titleNode("t1", "标题")));

        Map<String, Object> doc = BlockDocCodec.assemble(rows);

        assertEquals("title", BlockDocCodec.childrenOf(doc).get(0).get("type"));
    }

    // ------------------------------------------------------------------
    // Rank authority and hashing
    // ------------------------------------------------------------------

    /**
     * {@code attrs.rank} is stripped on write and re-supplied on read from the
     * column. Keeping a copy in the node would create a second authority on order
     * that silently drifts from the first.
     */
    @Test
    void rankIsStrippedOnWriteAndReinjectedOnRead() {
        Map<String, Object> paragraph = paragraph("p1", "内容");
        attrsOf(paragraph).put("rank", "客户端瞎写的");

        BlockDocCodec.FlatBlock flat = BlockDocCodec.flatten(doc(Arrays.asList(paragraph))).get(0);
        assertNull(attrsOf(flat.getNode()).get("rank"), "落库的 node 不得携带 rank");

        Map<String, Object> after = BlockDocCodec
                .assemble(Arrays.asList(row("p1", "paragraph", "服务端的rank", flat.getNode())));
        assertEquals("服务端的rank", attrsOf(BlockDocCodec.childrenOf(after).get(0)).get("rank"));
    }

    /** attrs.id is pinned to the authoritative block id on both directions. */
    @Test
    void attrsIdIsPinnedToTheBlockId() {
        Map<String, Object> paragraph = paragraph("p1", "内容");
        BlockDocCodec.FlatBlock flat = BlockDocCodec.toFlatBlock("authoritative", "paragraph", paragraph);
        assertEquals("authoritative", attrsOf(flat.getNode()).get("id"));
    }

    /**
     * The hash must not depend on the key order a client happened to send, or every
     * save would look like a content change and write every block.
     */
    @Test
    void hashIgnoresKeyOrder() {
        Map<String, Object> first = new LinkedHashMap<>();
        first.put("alpha", 1);
        first.put("beta", 2);
        Map<String, Object> second = new LinkedHashMap<>();
        second.put("beta", 2);
        second.put("alpha", 1);

        assertEquals(BlockDocCodec.hash(first), BlockDocCodec.hash(second));
    }

    @Test
    void hashDetectsRealChanges() {
        BlockDocCodec.FlatBlock before = BlockDocCodec.toFlatBlock("p1", "paragraph", paragraph("p1", "改之前"));
        BlockDocCodec.FlatBlock after = BlockDocCodec.toFlatBlock("p1", "paragraph", paragraph("p1", "改之后"));
        assertNotEquals(before.getNodeHash(), after.getNodeHash());
    }

    /** Re-normalising an already-normalised node must be a fixed point. */
    @Test
    void normalisationIsIdempotent() {
        BlockDocCodec.FlatBlock once = BlockDocCodec.toFlatBlock("p1", "paragraph", paragraph("p1", "内容"));
        BlockDocCodec.FlatBlock twice = BlockDocCodec.toFlatBlock("p1", "paragraph", once.getNode());
        assertEquals(once.getNodeHash(), twice.getNodeHash());
        assertEquals(once.getNodeJson(), twice.getNodeJson());
    }

    @Test
    void textIsTheConcatenationOfEveryTextLeaf() {
        Map<String, Object> doc = doc(Arrays.asList(
                node("blockquote", "bq", Arrays.asList(paragraph("p1", "甲"), paragraph("p2", "乙")))));
        assertEquals("甲乙", BlockDocCodec.extractText(doc));
    }

    @Test
    void emptyDocumentAssemblesToAnEmptyDoc() {
        Map<String, Object> doc = BlockDocCodec.assemble(new ArrayList<>());
        assertEquals("doc", doc.get("type"));
        assertTrue(BlockDocCodec.childrenOf(doc).isEmpty());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Flatten a doc into rows the way the write path does, ranks included. */
    static List<WikiBlock> store(Map<String, Object> doc) {
        List<BlockDocCodec.FlatBlock> flat = BlockDocCodec.flatten(doc);
        String[] ranks = FractionalIndex.keysForCount(flat.size());
        List<WikiBlock> rows = new ArrayList<>(flat.size());
        for (int i = 0; i < flat.size(); i++) {
            rows.add(row(flat.get(i).getBlockId(), flat.get(i).getType(), ranks[i], flat.get(i).getNodeJson()));
        }
        return rows;
    }

    static WikiBlock row(String blockId, String type, String rank, Map<String, Object> node) {
        return row(blockId, type, rank, BlockDocCodec.writeJson(node));
    }

    static WikiBlock row(String blockId, String type, String rank, String nodeJson) {
        WikiBlock block = new WikiBlock();
        block.setBlockId(blockId);
        block.setPageId(1L);
        block.setParentId(BlockDocCodec.TOP_LEVEL);
        block.setBlockRank(rank);
        block.setType(type);
        block.setNode(nodeJson);
        block.setNodeHash(BlockDocCodec.hash(BlockDocCodec.readJson(nodeJson)));
        block.setRev(1L);
        return block;
    }

    static Map<String, Object> doc(List<Map<String, Object>> children) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("type", "doc");
        doc.put("content", new ArrayList<>(children));
        return doc;
    }

    static Map<String, Object> node(String type, String id, List<Map<String, Object>> children) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", type);
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("id", id);
        node.put("attrs", attrs);
        if (children != null && !children.isEmpty()) {
            node.put("content", new ArrayList<>(children));
        }
        return node;
    }

    static Map<String, Object> paragraph(String id, String content) {
        return node("paragraph", id, Arrays.asList(text(content)));
    }

    static Map<String, Object> titleNode(String id, String content) {
        return node("title", id, Arrays.asList(text(content)));
    }

    static Map<String, Object> text(String content) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", "text");
        node.put("text", content);
        return node;
    }

    static Map<String, Object> markedText(String content, String markType) {
        Map<String, Object> node = text(content);
        Map<String, Object> mark = new LinkedHashMap<>();
        mark.put("type", markType);
        node.put("marks", new ArrayList<>(Arrays.asList(mark)));
        return node;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> attrsOf(Map<String, Object> node) {
        return (Map<String, Object>) node.get("attrs");
    }

}
