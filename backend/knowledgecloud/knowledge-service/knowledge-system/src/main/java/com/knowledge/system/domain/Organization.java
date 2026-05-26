package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.knowledge.core.common.base.BaseEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class Organization extends BaseEntity {
    
    @TableId
    private Long id;
    private String appKey;
    private String appSecret;
    private String name;
    private String email;
    private String address;

}
