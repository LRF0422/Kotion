package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_collaborator")
public class Collaborator extends TenantEntity {

    private Long id;
    private Long userId;

}
