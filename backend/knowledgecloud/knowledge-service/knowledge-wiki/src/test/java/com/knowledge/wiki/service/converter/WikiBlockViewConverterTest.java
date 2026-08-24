package com.knowledge.wiki.service.converter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.doc.BlockDocCodec;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.vo.WikiBlockVO;

class WikiBlockViewConverterTest {

    @Test
    void convertsCompleteNodeWithoutPageContentSemantics() {
        Map<String, Object> text = new LinkedHashMap<>();
        text.put("type", "text");
        text.put("text", "authoritative text");
        Map<String, Object> paragraph = new LinkedHashMap<>();
        paragraph.put("type", "paragraph");
        paragraph.put("attrs", attrs("id", "p1"));
        paragraph.put("content", Arrays.asList(text));

        WikiBlock block = new WikiBlock();
        block.setBlockId("p1");
        block.setPageId(10L);
        block.setParentId("");
        block.setBlockRank("a0");
        block.setType("paragraph");
        block.setText("authoritative text");
        block.setNode(BlockDocCodec.writeJson(paragraph));
        block.setRev(3L);

        Page page = new Page();
        page.setId(10L);
        page.setSpaceId(20L);
        page.setTitle("Page title");
        Space space = new Space();
        space.setId(20L);
        space.setName("Space name");

        WikiBlockVO list = WikiBlockViewConverter.toListVO(block, page, space);
        PageBlockDetailVO detail = WikiBlockViewConverter.toDetailVO(block, page, space);

        assertEquals("p1", list.getId());
        assertEquals("authoritative text", list.getText());
        assertEquals("authoritative text", list.getContent().get(0).getStr("text"));
        assertEquals("Page title", list.getPageTitle());
        assertEquals("Space name", list.getSpaceName());
        assertNotNull(detail.getContent());
        assertEquals("paragraph", detail.getContent().getStr("type"));
        assertEquals("authoritative text", detail.getChildren().get(0).getText());
    }

    private static Map<String, Object> attrs(Object... values) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) {
            attrs.put(String.valueOf(values[i]), values[i + 1]);
        }
        return attrs;
    }
}
