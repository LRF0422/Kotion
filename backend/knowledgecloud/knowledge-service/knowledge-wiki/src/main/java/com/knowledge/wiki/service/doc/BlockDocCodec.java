package com.knowledge.wiki.service.doc;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.exception.WikiException;

import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Translates between a whole ProseMirror document and the flat block rows that
 * are its authoritative representation.
 * <p>
 * <b>Which nodes become rows.</b> Exactly the direct children of {@code doc} —
 * the depth-1 nodes. Everything nested lives inside its ancestor's {@code node}
 * JSON and is never stored separately. This is the rule that permanently
 * eliminates the class of defect where a container was rebuilt from child rows
 * and lost its own inline content: there is nothing to rebuild.
 * </p>
 * <p>
 * The schema deliberately supports deeper rows ({@code parent_id} plus a rank per
 * sibling group) so nested addressable nodes can be added later — a block only
 * needs its own row when it must be addressed independently (comment anchor,
 * link target, AI edit target, search hit). Nothing needs that today, so nothing
 * claims it.
 * </p>
 */
@Slf4j
public final class BlockDocCodec {

    /** The single node type the schema pins to the first position in a doc. */
    public static final String TYPE_TITLE = "title";

    /** {@code parent_id} value meaning "direct child of doc". Never null. */
    public static final String TOP_LEVEL = "";

    /**
     * Serialises with map keys sorted, so a node's hash depends on its content
     * and not on the key order the client happened to send. Without this, a
     * client that reorders {@code attrs} would look like a content change and
     * trigger a pointless write on every save.
     */
    private static final ObjectMapper HASH_MAPPER;

    /** Preserves key order, for values that are stored and served back. */
    private static final ObjectMapper JSON = new ObjectMapper();

    static {
        HASH_MAPPER = new ObjectMapper();
        HASH_MAPPER.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
        HASH_MAPPER.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    private BlockDocCodec() {
    }

    /**
     * One depth-1 node, normalised into the shape a {@code wiki_block} row wants.
     * Carries no rank: rank is assigned by the server against live sibling state,
     * never taken from the client.
     */
    @Getter
    public static final class FlatBlock {

        private final String blockId;

        private final String type;

        private final Map<String, Object> node;

        private final String nodeJson;

        private final String nodeHash;

        private final String text;

        FlatBlock(String blockId, String type, Map<String, Object> node, String nodeJson, String nodeHash,
                String text) {
            this.blockId = blockId;
            this.type = type;
            this.node = node;
            this.nodeJson = nodeJson;
            this.nodeHash = nodeHash;
            this.text = text;
        }
    }

    /**
     * Split a document into its depth-1 blocks, in document order.
     * <p>
     * Two convergence rules are enforced here, at the door:
     * </p>
     * <ul>
     * <li><b>Duplicate block ids are resolved by dropping the later copy</b>, never
     * by renaming it. Renaming turns one repairable duplicate into two legitimate
     * blocks, and every downstream consumer — comments, block references, the
     * search index, journal replay — then has two valid targets where there should
     * be one. That is unrecoverable; dropping a copy is not.</li>
     * <li><b>A node with no id gets one minted.</b> That is assignment at creation,
     * which is allowed, and is distinct from regenerating an id a node already
     * has, which is not. Importers and server-side writers legitimately submit
     * id-less nodes.</li>
     * </ul>
     */
    public static List<FlatBlock> flatten(Map<String, Object> doc) {
        List<Map<String, Object>> children = childrenOf(doc);
        List<FlatBlock> blocks = new ArrayList<>(children.size());
        Set<String> seenIds = new HashSet<>();
        boolean titleSeen = false;
        int droppedDuplicates = 0;
        int droppedTitles = 0;

        for (Map<String, Object> child : children) {
            String type = asString(child.get("type"));
            if (StrUtil.isBlank(type)) {
                continue;
            }

            if (TYPE_TITLE.equals(type)) {
                if (titleSeen) {
                    droppedTitles++;
                    continue;
                }
                titleSeen = true;
            }

            String blockId = readBlockId(child);
            if (StrUtil.isBlank(blockId)) {
                blockId = IdUtil.fastSimpleUUID();
            } else if (!seenIds.add(blockId)) {
                droppedDuplicates++;
                continue;
            }
            seenIds.add(blockId);

            blocks.add(toFlatBlock(blockId, type, child));
        }

        if (droppedDuplicates > 0 || droppedTitles > 0) {
            log.warn("flatten: dropped {} duplicate-id blocks and {} extra title blocks", droppedDuplicates,
                    droppedTitles);
        }
        return blocks;
    }

    /**
     * Normalise a single node into row shape. {@code attrs.rank} is stripped: the
     * {@code block_rank} column is the only authority on order, and leaving a copy
     * inside the node would create a second one that drifts.
     */
    public static FlatBlock toFlatBlock(String blockId, String type, Map<String, Object> node) {
        Map<String, Object> normalised = normaliseNode(blockId, node);
        return new FlatBlock(blockId, type, normalised, writeJson(normalised), hash(normalised),
                extractText(normalised));
    }

    /**
     * Rebuild the document from its rows: order by rank, hoist the title to the
     * front because the schema requires {@code doc = title block*}.
     * <p>
     * Each node is returned exactly as it was stored, with only {@code attrs.id}
     * and {@code attrs.rank} re-applied from their authoritative columns. Nothing
     * is reassembled from children.
     * </p>
     */
    public static Map<String, Object> assemble(List<WikiBlock> rows) {
        List<WikiBlock> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparing(WikiBlock::getBlockRank, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(WikiBlock::getBlockId));

        List<Map<String, Object>> content = new ArrayList<>(sorted.size());
        int titleIndex = -1;
        for (WikiBlock row : sorted) {
            Map<String, Object> node = readJson(row.getNode());
            if (node == null) {
                log.warn("assemble: pageId={} blockId={} has unparseable node, skipped", row.getPageId(),
                        row.getBlockId());
                continue;
            }
            attrsOf(node).put("id", row.getBlockId());
            attrsOf(node).put("rank", row.getBlockRank());
            if (titleIndex < 0 && TYPE_TITLE.equals(row.getType())) {
                titleIndex = content.size();
            }
            content.add(node);
        }
        if (titleIndex > 0) {
            content.add(0, content.remove(titleIndex));
        }

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("type", "doc");
        doc.put("content", content);
        return doc;
    }

    /**
     * Content hash of a normalised node. Lets an unchanged block be skipped
     * without loading its JSON out of the database to compare.
     */
    public static String hash(Map<String, Object> node) {
        try {
            return DigestUtil.sha256Hex(HASH_MAPPER.writeValueAsString(node));
        } catch (JsonProcessingException e) {
            // A node that cannot be serialised cannot be stored either, so this is
            // a rejected request, not a hash fallback.
            throw WikiException.INVALID_PARAMETER.newException("块内容无法序列化: " + e.getOriginalMessage());
        }
    }

    /**
     * Plain text of a node, following ProseMirror's {@code textContent}: the
     * concatenation of every text leaf, no separators. Derived data — for search
     * and diff only, never a source of truth.
     */
    public static String extractText(Map<String, Object> node) {
        StringBuilder sb = new StringBuilder();
        collectText(node, sb);
        return sb.toString();
    }

    public static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw WikiException.INVALID_PARAMETER.newException("JSON 序列化失败: " + e.getOriginalMessage());
        }
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> readJson(String json) {
        if (StrUtil.isBlank(json)) {
            return null;
        }
        try {
            return JSON.readValue(json, Map.class);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /** The block id a node carries, from {@code attrs.id} or a top-level {@code id}. */
    public static String readBlockId(Map<String, Object> node) {
        String fromAttrs = asString(attrsOf(node).get("id"));
        return StrUtil.isNotBlank(fromAttrs) ? fromAttrs : asString(node.get("id"));
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> childrenOf(Map<String, Object> node) {
        if (node == null) {
            return new ArrayList<>();
        }
        Object content = node.get("content");
        if (!(content instanceof List)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> children = new ArrayList<>();
        for (Object item : (List<Object>) content) {
            if (item instanceof Map) {
                children.add((Map<String, Object>) item);
            }
        }
        return children;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> attrsOf(Map<String, Object> node) {
        Object attrs = node.get("attrs");
        if (attrs instanceof Map) {
            return (Map<String, Object>) attrs;
        }
        Map<String, Object> created = new LinkedHashMap<>();
        node.put("attrs", created);
        return created;
    }

    /**
     * Copy of the node with {@code attrs.id} pinned to the authoritative block id
     * and {@code attrs.rank} removed.
     */
    private static Map<String, Object> normaliseNode(String blockId, Map<String, Object> node) {
        Map<String, Object> copy = new LinkedHashMap<>(node);
        copy.remove("id");
        Map<String, Object> attrs = new LinkedHashMap<>(
                node.get("attrs") instanceof Map ? castMap(node.get("attrs")) : new HashMap<>());
        attrs.remove("rank");
        attrs.put("id", blockId);
        copy.put("attrs", attrs);
        return copy;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private static void collectText(Object node, StringBuilder sb) {
        if (!(node instanceof Map)) {
            return;
        }
        Map<String, Object> map = (Map<String, Object>) node;
        Object text = map.get("text");
        if (text instanceof String) {
            sb.append((String) text);
        }
        Object content = map.get("content");
        if (content instanceof List) {
            for (Object child : (List<Object>) content) {
                collectText(child, sb);
            }
        }
    }

    private static String asString(Object value) {
        return value instanceof String ? (String) value : null;
    }

}
