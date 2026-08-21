package com.knowledge.wiki.service.exception;

import com.knowledge.core.tool.exception.BusinessExceptionAssert;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum WikiException implements BusinessExceptionAssert {

    // Plugin related (1000-1999)
    PLUGIN_EXISTS(1000, "该插件已存在"),
    PLUGIN_NOT_FOUND(1001, "插件不存在"),
    PLUGIN_VERSION_NOT_FOUND(1002, "插件版本不存在"),

    // Space related (2000-2999)
    SPACE_NOT_FOUND(2001, "空间不存在"),
    SPACE_ALREADY_EXISTS(2002, "空间已存在"),
    PERSONAL_SPACE_CREATION_FAILED(2003, "个人空间创建失败"),

    // Page related (3000-3999)
    PAGE_NOT_FOUND(3001, "页面不存在"),
    PAGE_ALREADY_EXISTS(3002, "页面已存在"),
    PAGE_VERSION_NOT_FOUND(3003, "页面版本不存在"),
    UNPUBLISHED_PAGE_CANNOT_BE_TEMPLATE(3004, "未发布的页面不能保存为模板"),
    PAGE_PARENT_NOT_FOUND(3005, "父页面不存在"),
    NO_VERSION_TO_ROLLBACK(3006, "没有可回滚的版本"),
    CANNOT_ROLLBACK_TO_DRAFT(3007, "不能回滚到草稿版本"),
    VERSION_ALREADY_ACTIVE(3008, "该版本已经是当前激活版本"),
    INVALID_VERSION_COMPARISON(3009, "无效的版本对比"),
    BLOCK_NOT_FOUND(3010, "块不存在"),
    VERSION_NOT_FOUND(3011, "版本不存在"),
    CONTENT_PARSE_ERROR(3012, "内容解析失败"),
    PAGE_CIRCULAR_MOVE(3013, "不能将页面移动到自身或其子页面下"),

    // Collaboration related (4000-4999)
    INVITATION_NOT_FOUND(4001, "邀请不存在"),
    INVITATION_EXPIRED(4002, "邀请已过期"),
    INVITATION_ALREADY_ACCEPTED(4003, "邀请已被接受"),
    INVALID_INVITATION_STATUS(4004, "无效的邀请状态"),
    COLLABORATOR_NOT_FOUND(4005, "协作者不存在"),
    FORBIDDEN_ACCESS(4006, "无权访问"),
    SHARE_LINK_NOT_FOUND(4007, "分享链接不存在或已被重置"),
    SHARE_LINK_EXPIRED(4008, "分享链接已过期"),
    SHARE_LINK_DISABLED(4009, "分享链接已关闭"),
    // The caller is not the page's session host. Every interactive write goes
    // through the host, so this is a normal, expected outcome for a collaborator —
    // not an error condition the user did anything to cause.
    NOT_SESSION_HOST(4010, "当前不是该页面的编辑主持人，无法保存"),
    SESSION_ENDED(4011, "编辑会话已结束"),

    // Validation related (6000-6999)
    INVALID_PARAMETER(6001, "参数无效"),
    REQUIRED_PARAMETER_MISSING(6002, "缺少必需参数");

    private final int code;
    private final String message;

}
