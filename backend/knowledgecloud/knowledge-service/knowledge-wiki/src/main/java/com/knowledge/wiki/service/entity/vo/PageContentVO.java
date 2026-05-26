package com.knowledge.wiki.service.entity.vo;

import java.util.List;

import com.knowledge.wiki.service.entity.Mark;
import com.knowledge.wiki.service.entity.PageContent;
import cn.hutool.json.JSONObject;
import lombok.Data;

@Data
public class PageContentVO {

    private String id;
    private String type;
    private JSONObject attrs;
    private List<PageContent> content;
    private List<Mark> marks;
    private String text;
    private String parentId;
    private Long pageId;
    private String path; // 记录块在文档树中的路径，格式如: "0.1.2" 表示第0层->第1个子节点->第2个子节点
    private Integer sortOrder; // 同级兄弟节点排序序号
    private Integer version; // 块级别版本计数器

    // Fields for joined queries
    private Long spaceId;
    private String spaceName;
    private String pageTitle;

    public String getAttrId() {
        return attrs == null ? null : attrs.getStr("id");
    }

    /**
     * 获取块的完整路径标识
     * 
     * @return 路径字符串，格式为 pageId/path
     */
    public String getFullPath() {
        return pageId + "/" + (path != null ? path : id);
    }

}
