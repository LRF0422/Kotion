package com.knowledge.system.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * 开发者认证状态（服务间契约）。
 *
 * <p>knowledge-wiki 在发布插件前通过 {@code IDeveloperClient} 读取当前用户的
 * 认证状态；状态用字符串而不是枚举，避免跨服务的枚举序列化差异。
 */
@Data
public class DeveloperVerificationVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** PENDING / APPROVED / REJECTED / SUSPENDED；未提交时为 null。 */
    private String status;

    /** 已认证开发者的对外展示名称。 */
    private String displayName;
}
