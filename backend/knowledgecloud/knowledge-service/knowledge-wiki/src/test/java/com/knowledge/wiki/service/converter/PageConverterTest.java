package com.knowledge.wiki.service.converter;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.PageDTO;
import com.knowledge.wiki.service.entity.vo.PageVO;

class PageConverterTest {

    @Test
    void preservesOpaquePageTypeAcrossRequestAndResponseMappings() {
        PageDTO dto = new PageDTO();
        dto.setPageType("plugin.example/custom-component:v1");

        Page page = PageConverter.INSTANCE.convertDO(dto);
        PageVO response = PageConverter.INSTANCE.convertVO(page);

        assertEquals("plugin.example/custom-component:v1", page.getPageType());
        assertEquals("plugin.example/custom-component:v1", response.getPageType());
    }

}
