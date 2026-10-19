package com.knowledge.wiki.service.entity;

import com.knowledge.core.common.base.BaseEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class Developer extends BaseEntity {

    private Long id;
    private String name;

}
