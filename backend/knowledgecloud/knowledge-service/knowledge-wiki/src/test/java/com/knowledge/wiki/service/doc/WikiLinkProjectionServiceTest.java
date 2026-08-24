package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.WikiLink;

class WikiLinkProjectionServiceTest {

    @Test
    void extractsMarksAndReferenceNodesFromWikiBlockNode() {
        Map<String, Object> markedText = node("text");
        markedText.put("text", "linked text");
        markedText.put("marks", Arrays.asList(mark("pageLink", attrs("pageId", "42"))));

        Map<String, Object> paragraph = node("paragraph");
        paragraph.put("content", Arrays.asList(markedText,
                atom("BlockReference", attrs("blockId", "block-9", "pageId", 9L))));

        List<WikiLink> links = WikiLinkProjectionService.extractLinks(7L,
                Arrays.asList(block("p1", paragraph)));

        assertEquals(2, links.size());
        Map<String, WikiLink> byTarget = links.stream()
                .collect(Collectors.toMap(WikiLink::getTargetType, link -> link));
        assertEquals(42L, byTarget.get("PAGE").getTargetPageId());
        assertEquals("NORMAL", byTarget.get("PAGE").getLinkKind());
        assertEquals("block-9", byTarget.get("BLOCK").getTargetId());
        assertEquals("EMBED", byTarget.get("BLOCK").getLinkKind());
    }

    @Test
    void deduplicatesRepeatedTargetsAndDropsUnresolvedLinks() {
        Map<String, Object> paragraph = node("paragraph");
        paragraph.put("content", Arrays.asList(
                atom("PageReference", attrs("pageId", 42L, "title", "Target")),
                atom("pageLinkNode", attrs("pageId", "42", "title", "Target again")),
                atom("BlockReference", new LinkedHashMap<String, Object>())));

        List<WikiLink> links = WikiLinkProjectionService.extractLinks(7L,
                Arrays.asList(block("p1", paragraph)));

        assertEquals(1, links.size());
        assertEquals("PAGE", links.get(0).getTargetType());
        assertEquals(42L, links.get(0).getTargetPageId());
    }

    private static WikiBlock block(String id, Map<String, Object> node) {
        WikiBlock block = new WikiBlock();
        block.setBlockId(id);
        block.setPageId(7L);
        block.setNode(BlockDocCodec.writeJson(node));
        return block;
    }

    private static Map<String, Object> node(String type) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", type);
        return node;
    }

    private static Map<String, Object> atom(String type, Map<String, Object> attrs) {
        Map<String, Object> node = node(type);
        node.put("attrs", attrs);
        return node;
    }

    private static Map<String, Object> mark(String type, Map<String, Object> attrs) {
        return atom(type, attrs);
    }

    private static Map<String, Object> attrs(Object... values) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) {
            attrs.put(String.valueOf(values[i]), values[i + 1]);
        }
        return attrs;
    }
}
