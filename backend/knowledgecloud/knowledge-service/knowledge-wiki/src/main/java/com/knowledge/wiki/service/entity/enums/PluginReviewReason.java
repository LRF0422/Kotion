package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Structured rejection reason codes. Kept machine-readable so the admin console
 * can aggregate rejection causes and the developer submission page can render a
 * localized label without parsing free text.
 */
@Getter
@AllArgsConstructor
public enum PluginReviewReason implements BaseEnum<String> {

    ARTIFACT_INVALID("ARTIFACT_INVALID", "产物无效或无法加载"),
    INTEGRITY_MISMATCH("INTEGRITY_MISMATCH", "完整性校验不通过"),
    DESCRIPTION_MISMATCH("DESCRIPTION_MISMATCH", "描述与实现不符"),
    SECURITY_RISK("SECURITY_RISK", "存在安全风险"),
    POLICY_VIOLATION("POLICY_VIOLATION", "违反平台规范"),
    OTHER("OTHER", "其他");

    private final String value;
    private final String desc;
}
