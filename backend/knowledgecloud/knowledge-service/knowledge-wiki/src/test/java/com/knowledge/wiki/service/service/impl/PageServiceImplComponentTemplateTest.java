package com.knowledge.wiki.service.service.impl;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

import org.junit.jupiter.api.Test;

import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.wiki.service.entity.Page;

class PageServiceImplComponentTemplateTest {

    @Test
    void componentPageCannotBeSavedAsPageTemplateAtServiceBoundary() {
        PageServiceImpl service = spy(new PageServiceImpl());
        Page source = new Page();
        source.setId(9L);
        source.setPageType("meeting-minutes");
        doReturn(source).when(service).getById(9L);

        assertThrows(BusinessException.class, () -> service.saveAsTemplate(9L, null));
    }

}
