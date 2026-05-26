package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

@Data
public class TemplateDTO implements Serializable {

    private Long spaceId;
    private List<String> screenShot;
    private String description;

}
