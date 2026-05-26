package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.knowledge.core.common.base.Icon;
import com.knowledge.wiki.service.entity.enums.SpaceStatus;
import com.knowledge.wiki.service.entity.enums.SpaceType;

import lombok.Data;

@Data
public class SpaceVO implements Serializable {

    private Long id;
    private Long userId;
    private String nickName;
    private String name;
    private SpaceStatus status;
    private Icon icon;
    private String description;
    private Long homePageId;
    private SpaceType type;
    private boolean favorite;
    private String cover;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

}
