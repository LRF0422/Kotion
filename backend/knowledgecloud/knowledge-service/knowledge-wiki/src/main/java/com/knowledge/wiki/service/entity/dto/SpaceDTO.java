package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;

import com.knowledge.core.common.base.Icon;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.entity.enums.SpaceVisibility;

import lombok.Data;

@Data
public class SpaceDTO implements Serializable {

    private Long id;
    private Long userId;
    private String nickName;
    @NotBlank(message = "空间名称不能为空")
    private String name;
    private Icon icon;
    private String description;
    private String cover;

    /**
     * Space type: PERSONAL, COLLABORATION, etc.
     */
    private SpaceType type;

    /**
     * Space visibility: PUBLIC or PRIVATE
     */
    private SpaceVisibility visibility;

}
