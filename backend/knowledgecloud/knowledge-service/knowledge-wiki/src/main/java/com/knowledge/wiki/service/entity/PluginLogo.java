package com.knowledge.wiki.service.entity;

import java.io.Serializable;

import lombok.Data;

@Data
public class PluginLogo implements Serializable {

    private String path;
    private Integer size;

}
