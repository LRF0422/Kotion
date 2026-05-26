package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.List;

import cn.hutool.json.JSONObject;
import lombok.Data;

@Data
public class PageBlockVO implements Serializable {

    private String id;
    private Long spaceId;
    private String spaceName;
    private Long pageId;
    private String pageTitle;
    private List<JSONObject> content;
    private String type;

}
