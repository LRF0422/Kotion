package com.knowledge.core.mp.config.jackson;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.knowledge.core.base.IBaseEnum;
import com.knowledge.core.tool.utils.ObjectUtil;

import cn.hutool.json.JSONObject;
import lombok.SneakyThrows;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class EnumListDeserializer extends JsonDeserializer<List<Enum<?>>> {

    @Override
    @SneakyThrows
    public List<Enum<?>> deserialize(JsonParser jsonParser, DeserializationContext deserializationContext)
            throws IOException, JsonProcessingException {
        ArrayNode treeNode = jsonParser.readValueAsTree();
        Field field;
        try {
            field = jsonParser.getCurrentValue().getClass().getDeclaredField(jsonParser.currentName());
        } catch (NoSuchFieldException e) {
            return null;
        }
        field.setAccessible(true);
        if (!field.getType().equals(List.class)) {
            return null;
        }
        ParameterizedType genericType = (ParameterizedType) field.getGenericType();
        Class actualTypeArgument = (Class) genericType.getActualTypeArguments()[0];
        List<Enum<?>> result = new ArrayList<>();
        Iterator<JsonNode> elements = treeNode.elements();
        while (elements.hasNext()) {
            try {
                Enum valueOf;
                JsonNode node = elements.next();
                if (IBaseEnum.class.isAssignableFrom(actualTypeArgument)) {
                    JSONObject jsonObject = toJson(node.toString());
                    if (ObjectUtil.isNotEmpty(jsonObject)) {
                        String value = jsonObject.getStr("value");
                        valueOf = IBaseEnum.getEnum(actualTypeArgument, value);
                    } else {
                        valueOf = IBaseEnum.getEnum(actualTypeArgument, node.asText());
                    }
                } else {
                    try {
                        valueOf = Enum.valueOf(actualTypeArgument, node.asText());
                    } catch (IllegalArgumentException e) {
                        throw new RuntimeException("找不到对应的枚举类型");
                    }
                }
                result.add(valueOf);
            } catch (IllegalArgumentException e) {
                // ignore
            }
        }
        if (result.isEmpty()) {
            return null;
        } else {
            return result;
        }
    }

    private static JSONObject toJson(String string) {
        try {
            return new JSONObject(string);
        } catch (Exception e) {
            return null;
        }
    }
}
