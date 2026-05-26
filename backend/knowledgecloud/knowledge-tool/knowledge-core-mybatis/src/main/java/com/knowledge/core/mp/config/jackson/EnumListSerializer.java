package com.knowledge.core.mp.config.jackson;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.knowledge.core.base.IBaseEnum;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class EnumListSerializer extends JsonSerializer<List<IBaseEnum<?>>> {

    @Override
    public void serialize(List<IBaseEnum<?>> o, JsonGenerator jsonGenerator, SerializerProvider serializerProvider) throws IOException {
        List<Map<String, Object>> data = new ArrayList<>();
        o.forEach(it -> {
            Map<String, Object> map = new HashMap<>();
            map.put("value", it.getValue());
            map.put("desc", it.getDesc());
            data.add(map);
        });
        jsonGenerator.writeObject(data);
    }
}
