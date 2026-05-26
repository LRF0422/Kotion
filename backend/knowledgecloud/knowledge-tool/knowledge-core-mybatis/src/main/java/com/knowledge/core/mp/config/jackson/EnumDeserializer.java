package com.knowledge.core.mp.config.jackson;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.knowledge.core.base.IBaseEnum;
import com.knowledge.core.tool.utils.ObjectUtil;

import cn.hutool.json.JSONObject;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.util.Assert;

import java.io.IOException;

/**
 * @author
 * @Desc
 */
@Slf4j
@SuppressWarnings("all")
public class EnumDeserializer extends JsonDeserializer<Enum> {

    @Override
    @SneakyThrows
    public Enum<?> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonNode node = p.getCodec().readTree(p);
        String currentName = p.currentName();
        Object currentValue = p.getCurrentValue();
        Class findPropertyType = BeanUtils.findPropertyType(currentName, currentValue.getClass());

        Assert.notNull(findPropertyType, "在" + currentValue.getClass() + "实体类中找不到" + currentName + "字段");
        String asText = node.asText();
        Enum valueOf;
        if (IBaseEnum.class.isAssignableFrom(findPropertyType)) {
            JSONObject jsonObject = toJson(node.toString());
            if (ObjectUtil.isNotEmpty(jsonObject)) {
                String value = jsonObject.getStr("value");
                valueOf = IBaseEnum.getEnum(findPropertyType, value);
            } else {
                valueOf = IBaseEnum.getEnum(findPropertyType, asText);
            }
        } else {
            try {
                valueOf = Enum.valueOf(findPropertyType, asText);
            } catch (IllegalArgumentException e) {
                log.error("找不到对应的枚举类型");
                throw new RuntimeException("找不到对应的枚举类型");
            }
        }
        return valueOf;
    }

    private static JSONObject toJson(String string) {
        try {
            return new JSONObject(string);
        } catch (Exception e) {
            return null;
        }
    }

}
