package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class FavoriteItemVO implements Serializable {

    private Long id;
    private String name;
    private String scope;
    private Long objectId;
    private String nickName;
    private Long userId;        

}
