package com.knowledge.wiki.service.entity;

import java.io.Serializable;

import lombok.Data;

@Data
public class VersionDesc implements Serializable {

    private String label;
    private String content;

}
