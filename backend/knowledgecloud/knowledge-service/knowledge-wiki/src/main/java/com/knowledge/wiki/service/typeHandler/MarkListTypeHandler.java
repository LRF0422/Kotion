package com.knowledge.wiki.service.typeHandler;

import com.knowledge.core.mp.typehandler.ListTypeHandler;
import com.knowledge.wiki.service.entity.Mark;

public class MarkListTypeHandler extends ListTypeHandler<Mark> {

    @Override
    protected Class<Mark> specificType() {
        return Mark.class;
    }

}
