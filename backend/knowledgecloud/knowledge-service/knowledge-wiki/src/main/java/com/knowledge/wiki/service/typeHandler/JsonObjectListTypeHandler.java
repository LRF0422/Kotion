package com.knowledge.wiki.service.typeHandler;

import com.knowledge.core.mp.typehandler.ListTypeHandler;

import cn.hutool.json.JSONObject;

public class JsonObjectListTypeHandler extends ListTypeHandler<JSONObject> {

    @Override
    protected Class<JSONObject> specificType() {
        return JSONObject.class;
    }

}
