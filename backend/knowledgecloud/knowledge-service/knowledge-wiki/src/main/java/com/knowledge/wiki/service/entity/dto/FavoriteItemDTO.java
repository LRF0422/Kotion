package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class FavoriteItemDTO implements Serializable {

    private Long id;
    private String name;
    private String scope;
    private Long objectId;
    private String nickName;
    private Long userId;

}
