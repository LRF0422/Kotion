package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.List;

import cn.hutool.json.JSONObject;
import lombok.Data;

/**
 * API view of an authoritative {@code wiki_block} row.
 *
 * The shape intentionally stays compatible with the historical block-list API,
 * while avoiding any dependency on the legacy PageContent persistence entity.
 */
@Data
public class WikiBlockVO implements Serializable {

    private String id;
    private String type;
    private JSONObject attrs;
    private List<JSONObject> content;
    private List<JSONObject> marks;
    private String text;
    private String parentId;
    private Long pageId;
    private String blockRank;
    private Long rev;

    private Long spaceId;
    private String spaceName;
    private String pageTitle;
}
