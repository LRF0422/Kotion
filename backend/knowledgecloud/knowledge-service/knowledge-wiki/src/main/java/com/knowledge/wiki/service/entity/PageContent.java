package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.FastjsonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.typeHandler.MarkListTypeHandler;
import com.knowledge.wiki.service.typeHandler.PageContgentListTypehandler;

import cn.hutool.json.JSONObject;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName(value = "wiki_page_block", autoResultMap = true)
@EqualsAndHashCode(callSuper = true)
public class PageContent extends TenantEntity {

    private String id;
    private String type;
    @TableField(typeHandler = FastjsonTypeHandler.class, updateStrategy = com.baomidou.mybatisplus.annotation.FieldStrategy.IGNORED)
    private JSONObject attrs;
    @TableField(typeHandler = PageContgentListTypehandler.class, updateStrategy = com.baomidou.mybatisplus.annotation.FieldStrategy.IGNORED)
    private List<PageContent> content;
    @TableField(typeHandler = MarkListTypeHandler.class, updateStrategy = com.baomidou.mybatisplus.annotation.FieldStrategy.IGNORED)
    private List<Mark> marks;
    @TableField(updateStrategy = com.baomidou.mybatisplus.annotation.FieldStrategy.IGNORED)
    private String text;
    private String parentId;
    private Long pageId;
    private String path; // 记录块在文档树中的路径，格式如: "0.1.2" 表示第0层->第1个子节点->第2个子节点
    private Integer sortOrder; // 同级兄弟节点排序序号
    private Integer version; // 块级别版本计数器
    private String contentHash; // MD5 hash of block content for change detection

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
