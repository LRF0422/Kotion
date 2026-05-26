package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.BaseEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_page_history")
public class PageHistory extends BaseEntity {

    private Long id;
    private String pageId;
    private String content;

}
