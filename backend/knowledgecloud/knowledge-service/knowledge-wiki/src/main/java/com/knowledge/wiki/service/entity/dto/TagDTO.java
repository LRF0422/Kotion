package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class TagDTO implements Serializable {

    private String id;
    private String text;

}
