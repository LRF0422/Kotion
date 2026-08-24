package com.knowledge.wiki.service.doc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.knowledge.wiki.service.entity.PageOp;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.dto.BlockOpDTO;
import com.knowledge.wiki.service.exception.WikiException;

import cn.hutool.core.util.StrUtil;

/** Deterministic replay of the server-normalised page op journal. */
final class PageDocReplay {

    private PageDocReplay() {
    }

    static Map<String, Object> replay(Map<String, Object> checkpointDoc, List<PageOp> entries) {
        Map<String, WikiBlock> rows = rowsOf(checkpointDoc);
        if (entries != null) {
            for (PageOp entry : entries) {
                applyEntry(rows, entry);
            }
        }
        return BlockDocCodec.assemble(new ArrayList<>(rows.values()));
    }

    static int blockCount(Map<String, Object> doc) {
        return BlockDocCodec.childrenOf(doc).size();
    }

    private static Map<String, WikiBlock> rowsOf(Map<String, Object> doc) {
        Map<String, WikiBlock> rows = new LinkedHashMap<>();
        if (doc == null) {
            return rows;
        }
        String previousRank = null;
        for (Map<String, Object> node : BlockDocCodec.childrenOf(doc)) {
            String blockId = BlockDocCodec.readBlockId(node);
            if (StrUtil.isBlank(blockId)) {
                throw corrupt("checkpoint contains a block without id");
            }
            String rank = stringAttr(node, "rank");
            if (StrUtil.isBlank(rank)) {
                rank = FractionalIndex.keyBetween(previousRank, null);
            }
            previousRank = rank;
            rows.put(blockId, row(blockId, BlockDocCodec.TOP_LEVEL, rank, node, 0L));
        }
        return rows;
    }

    private static void applyEntry(Map<String, WikiBlock> rows, PageOp entry) {
        if (entry == null || entry.getRev() == null) {
            throw corrupt("journal entry is missing rev");
        }
        List<Map<String, Object>> ops = BlockDocCodec.readJsonList(entry.getOps());
        if (ops == null) {
            throw corrupt("journal entry at rev " + entry.getRev() + " is not a JSON op array");
        }
        for (Map<String, Object> op : ops) {
            apply(rows, op, entry.getRev());
        }
    }

    @SuppressWarnings("unchecked")
    private static void apply(Map<String, WikiBlock> rows, Map<String, Object> op, long rev) {
        if (op == null) {
            throw corrupt("journal contains a null op at rev " + rev);
        }
        String kind = string(op.get("op"));
        String blockId = string(op.get("blockId"));
        if (StrUtil.isBlank(kind) || StrUtil.isBlank(blockId)) {
            throw corrupt("journal op is missing kind or blockId at rev " + rev);
        }

        if (BlockOpDTO.OP_INSERT.equals(kind)) {
            if (rows.containsKey(blockId)) {
                throw corrupt("insert references an existing block at rev " + rev + ": " + blockId);
            }
            Object nodeValue = op.get("node");
            if (!(nodeValue instanceof Map)) {
                throw corrupt("insert is missing node at rev " + rev);
            }
            String rank = string(op.get("rank"));
            if (StrUtil.isBlank(rank)) {
                throw corrupt("insert is missing server rank at rev " + rev);
            }
            rows.put(blockId, row(blockId, normaliseParent(string(op.get("parentId"))), rank,
                    (Map<String, Object>) nodeValue, rev));
            return;
        }

        WikiBlock existing = rows.get(blockId);
        if (BlockOpDTO.OP_DELETE.equals(kind)) {
            if (existing == null) {
                throw corrupt("delete references a missing block at rev " + rev + ": " + blockId);
            }
            rows.remove(blockId);
            return;
        }
        if (existing == null) {
            throw corrupt(kind + " references a missing block at rev " + rev + ": " + blockId);
        }

        if (BlockOpDTO.OP_REPLACE.equals(kind)) {
            Object nodeValue = op.get("node");
            if (!(nodeValue instanceof Map)) {
                throw corrupt("replace is missing node at rev " + rev);
            }
            WikiBlock replacement = row(blockId, existing.getParentId(), existing.getBlockRank(),
                    (Map<String, Object>) nodeValue, rev);
            rows.put(blockId, replacement);
            return;
        }
        if (BlockOpDTO.OP_MOVE.equals(kind)) {
            String rank = string(op.get("rank"));
            if (StrUtil.isBlank(rank)) {
                throw corrupt("move is missing server rank at rev " + rev);
            }
            existing.setParentId(normaliseParent(string(op.get("parentId"))));
            existing.setBlockRank(rank);
            existing.setRev(rev);
            return;
        }
        throw corrupt("unknown journal op at rev " + rev + ": " + kind);
    }

    private static WikiBlock row(String blockId, String parentId, String rank, Map<String, Object> node, long rev) {
        String type = string(node.get("type"));
        BlockDocCodec.FlatBlock flat = BlockDocCodec.toFlatBlock(blockId,
                StrUtil.blankToDefault(type, "paragraph"), node);
        WikiBlock row = new WikiBlock();
        row.setBlockId(blockId);
        row.setParentId(normaliseParent(parentId));
        row.setBlockRank(rank);
        row.setType(flat.getType());
        row.setNode(flat.getNodeJson());
        row.setNodeHash(flat.getNodeHash());
        row.setText(flat.getText());
        row.setRev(rev);
        return row;
    }

    @SuppressWarnings("unchecked")
    private static String stringAttr(Map<String, Object> node, String name) {
        Object attrs = node.get("attrs");
        return attrs instanceof Map ? string(((Map<String, Object>) attrs).get(name)) : null;
    }

    private static String normaliseParent(String parentId) {
        return StrUtil.blankToDefault(parentId, BlockDocCodec.TOP_LEVEL);
    }

    private static String string(Object value) {
        return value instanceof String ? (String) value : null;
    }

    private static RuntimeException corrupt(String message) {
        return WikiException.CONTENT_PARSE_ERROR.newException(message);
    }
}
