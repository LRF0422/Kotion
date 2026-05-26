package com.knowledge.wiki.service.typeHandler;

import com.knowledge.core.mp.typehandler.ListTypeHandler;
import com.knowledge.core.tool.KnowledgeUser;

public class KnowledgeUserListTypeHandler extends ListTypeHandler<KnowledgeUser> {

    @Override
    protected Class<KnowledgeUser> specificType() {
       return KnowledgeUser.class;
    }
    
}
