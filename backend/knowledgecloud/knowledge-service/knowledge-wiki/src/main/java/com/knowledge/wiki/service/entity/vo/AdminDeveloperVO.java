package com.knowledge.wiki.service.entity.vo;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 审核后台看到的开发者认证档案：额外带上完整证件号与内部审核备注。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class AdminDeveloperVO extends DeveloperVO {

    /** 完整证件号，仅审核后台可见。 */
    private String idNumber;
    private String reviewComment;
    private Long reviewerId;
}
