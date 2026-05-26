package com.knowledge.core.common.base;

import com.baomidou.mybatisplus.annotation.IEnum;
import com.knowledge.core.base.IBaseEnum;

import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * @author
 * @Desc
 */
public interface BaseEnum<T extends Serializable> extends IEnum<T>, IBaseEnum<T> {

    
    String getDesc();

    static <T extends Enum<T> & BaseEnum, V extends Serializable> T getEnum(Class<T> c, V value) throws RuntimeException {
        Optional.ofNullable(value).orElseThrow(() -> new RuntimeException("枚举参数有误"));
        String target = value.toString();
        try {
            Enum<T> anEnum = Enum.valueOf(c, value.toString().toUpperCase());
            return (T) anEnum;
        } catch (Exception e) {
            return Stream.of(c.getEnumConstants())
                    .filter(element -> Objects.equals(element.getValue().toString(), target))
                    .findFirst().orElseThrow(() -> new RuntimeException("枚举参数有误"));
        }
    }

}
