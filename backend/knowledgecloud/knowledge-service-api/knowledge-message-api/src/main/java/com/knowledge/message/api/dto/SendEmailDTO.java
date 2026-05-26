package com.knowledge.message.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

@Data
public class SendEmailDTO implements Serializable {

    private String title;
    private String content;
    private String templateId;
    private Map<String, Object> params;
    private String to;
}
