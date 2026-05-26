package com.knowledge.wiki.service.typeHandler;

import com.knowledge.core.mp.typehandler.ListTypeHandler;
import com.knowledge.wiki.service.entity.VersionDesc;

public class VersionDescListTypeHandler extends ListTypeHandler<VersionDesc> {

    @Override
    protected Class<VersionDesc> specificType() {
        return VersionDesc.class;
    }

}
