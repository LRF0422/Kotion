package com.knowledge.core.mp.config.jackson;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.knowledge.core.base.IBaseEnum;

import java.io.IOException;
import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

/**
 * @author
 * @Desc
 */

public class EnumSerializer extends JsonSerializer<IBaseEnum<? extends Serializable>> {
    @Override
    public void serialize(IBaseEnum<? extends Serializable> value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        Map<String,Object> map = new HashMap<>();
        map.put("value", value.getValue());
        map.put("desc", value.getDesc());
        gen.writeObject(map);
    }

}
