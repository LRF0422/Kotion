package com.knowledge.core.mp.config.jackson;

import lombok.SneakyThrows;
import org.springframework.boot.configurationprocessor.json.JSONObject;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;

import com.knowledge.core.base.IBaseEnum;

/**
 * @author
 * @Desc 编码 -> 枚举 转化器工厂类
 */
@SuppressWarnings({"all"})
public class EnumConverterFactory implements ConverterFactory<String, Enum<?>> {

    @Override
    public <T extends Enum<?>> Converter<String, T> getConverter(Class<T> targetType) {
        return new BaseEnumConverter(targetType);
    }

    public class BaseEnumConverter<S, T extends Enum> implements Converter<S, Enum> {

        private Class type;

        public BaseEnumConverter(Class<?> type) {
            this.type = type;
        }

        @Override
		@SneakyThrows
        public Enum convert(S source) {
            String asText = source.toString();
            if (IBaseEnum.class.isAssignableFrom(type)) {
                Enum valueOf = null;
                if (isJson(asText)) {
                    JSONObject jsonObject = new JSONObject(asText);
                    String value;
                    try {
                        value = jsonObject.getString("value");
                    } catch (Exception e) {
                        throw new RuntimeException("枚举参数错误");
                    }
                    valueOf = IBaseEnum.getEnum(type, value);
                } else {
                    valueOf = IBaseEnum.getEnum(type, asText);
                }
                return valueOf;
            }
            try {
                return Enum.valueOf(type, asText);
            } catch (IllegalArgumentException e) {
                throw new RuntimeException("找不到对应的枚举类型");
            }
        }
    }

    private static boolean isJson(String string) {
        try {
            new JSONObject(string);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
