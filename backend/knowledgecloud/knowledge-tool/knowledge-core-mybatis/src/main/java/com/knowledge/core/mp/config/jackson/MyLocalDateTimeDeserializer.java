package com.knowledge.core.mp.config.jackson;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.knowledge.core.tool.utils.NumberUtil;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * 支持时间戳反序列化
 * @author
 * @Desc
 */
@Slf4j
public class MyLocalDateTimeDeserializer extends LocalDateTimeDeserializer {


    public MyLocalDateTimeDeserializer(DateTimeFormatter formatter) {
        super(formatter);
    }
    @Override
    public LocalDateTime deserialize(JsonParser p, DeserializationContext cTxt) throws IOException, JsonProcessingException {
        String d = p.getValueAsString();
        if(NumberUtil.isNumber(d)){
            return Instant.ofEpochMilli(Long.valueOf(d)).atZone(ZoneOffset.ofHours(8)).toLocalDateTime();
        }else{
            return super.deserialize(p,cTxt);
        }
    }


}
