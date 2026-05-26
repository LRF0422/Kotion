package com.knowledge.system.domain;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

@Data
public class Meta implements Serializable {

    private String defaultIcon;
    private List<Menu> menus;

}
