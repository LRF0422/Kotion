package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.version.BaseVersion;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_page_version")
public class PageVersion extends BaseVersion {

    private String md5Code;
    private Long parentId;
    private String title;
    private String changeSummary;

}
