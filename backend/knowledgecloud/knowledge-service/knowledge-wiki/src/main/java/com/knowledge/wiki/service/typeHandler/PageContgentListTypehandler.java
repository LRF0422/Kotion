package com.knowledge.wiki.service.typeHandler;

import com.knowledge.core.mp.typehandler.ListTypeHandler;
import com.knowledge.wiki.service.entity.PageContent;

public class PageContgentListTypehandler extends ListTypeHandler<PageContent> {

    @Override
    protected Class<PageContent> specificType() {
        return PageContent.class;
    }

}
