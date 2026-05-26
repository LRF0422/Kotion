package com.knowledge.core.mp.config.jackson;

import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateDeserializer;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateSerializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalTimeSerializer;
import com.knowledge.core.base.IBaseEnum;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * @author
 * @Desc 序列化,反序列化,格式处理
 */
@Configuration
public class  JacksonCustomizerConfig {

    @Value("${spring.jackson.date-format:yyyy-MM-dd HH:mm:ss}")
    private String localDateTimePattern;

    @Value("${spring.jackson.local-date-format:yyyy-MM-dd}")
    private String localDatePattern;

    @Value("${spring.jackson.local-time-format:HH:mm:ss}")
    private String localTimePattern;

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jackson2ObjectMapperBuilderCustomizer() {
        return builder -> {
            builder.serializerByType(Long.TYPE, ToStringSerializer.instance);
            builder.serializerByType(Long.class, ToStringSerializer.instance);
            builder.serializerByType(IBaseEnum.class, new EnumSerializer());
            builder.serializerByType(LocalDateTime.class, new LocalDateTimeSerializer(DateTimeFormatter.ofPattern(localDateTimePattern)));
            builder.serializerByType(LocalDate.class, new LocalDateSerializer(DateTimeFormatter.ofPattern(localDatePattern)));
            builder.serializerByType(LocalTime.class, new LocalTimeSerializer(DateTimeFormatter.ofPattern(localTimePattern)));
            builder.deserializerByType(LocalDateTime.class, new MyLocalDateTimeDeserializer(DateTimeFormatter.ofPattern(localDateTimePattern)));
            builder.deserializerByType(LocalDate.class, new LocalDateDeserializer(DateTimeFormatter.ofPattern(localDatePattern)));
            builder.deserializerByType(LocalTime.class, new LocalTimeDeserializer(DateTimeFormatter.ofPattern(localTimePattern)));
            builder.deserializerByType(Enum.class, new EnumDeserializer());
        };
    }

    /**
     * 时间LocalDateTime转换
     */
    @Component
    public static class LocalDateTimeConverter implements Converter<String, LocalDateTime> {
        @Override
        public LocalDateTime convert(String source) {
            if (StringUtils.isBlank(source)) {
                return null;
            }
            if (source.matches("^\\d{4}-\\d{1,2}-\\d{1,2} {1}\\d{1,2}:\\d{1,2}:\\d{1,2}$")) {
                return LocalDateTime.parse(source, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
            throw new IllegalArgumentException("非法时间格式 '" + source + "'");
        }
    }

    /**
     * 时间LocalTime转换
     */
    @Component
    public static class LocalTimeConverter implements Converter<String, LocalTime> {
        @Override
        public LocalTime convert(String source) {
            if (StringUtils.isBlank(source)) {
                return null;
            }
            if (source.matches("^\\d{1,2}:\\d{1,2}:\\d{1,2}$")) {
                return LocalTime.parse(source, DateTimeFormatter.ofPattern("HH:mm:ss"));
            }
            throw new IllegalArgumentException("非法时间格式 '" + source + "'");
        }
    }

    /**
     * 时间LocalDate转换
     */
    @Component
    public static class LocalDateConverter implements Converter<String, LocalDate> {
        @Override
        public LocalDate convert(String source) {
            if (StringUtils.isBlank(source)) {
                return null;
            }
            if (source.matches("^\\d{4}-\\d{1,2}-\\d{1,2}$")) {
                return LocalDate.parse(source, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            }
            throw new IllegalArgumentException("非法时间格式 '" + source + "'");
        }
    }



}
