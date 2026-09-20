package com.knowledge.wiki.service.exception;

import com.knowledge.core.tool.exception.BusinessExceptionAssert;
import com.knowledge.wiki.service.i18n.WikiMessages;

import lombok.Getter;

/**
 * 知识库业务异常。
 *
 * <p>每个常量声明三件事：业务码（前端可用于分支/埋点）、i18n key
 * （{@code i18n/messages*.properties}）与中文兜底文案。真正返回给前端的
 * 文案在 {@link #getMessage()} 里按请求语言解析（前端通过 Accept-Language
 * 传当前界面语言），解析不到时回退到中文兜底文案。
 *
 * <p>文案里的 {@code {}} 占位符由 {@code BusinessException} 在抛出时按
 * {@code newException(args...)} 的顺序填充，例如
 * {@code PLUGIN_UNKNOWN_CAPABILITY.newException(value)}。
 */
@Getter
public enum WikiException implements BusinessExceptionAssert {

    // Plugin related (1000-1999)
    PLUGIN_EXISTS(1000, "wiki.plugin.exists", "该插件已存在"),
    PLUGIN_NOT_FOUND(1001, "wiki.plugin.notFound", "插件不存在"),
    PLUGIN_VERSION_NOT_FOUND(1002, "wiki.plugin.versionNotFound", "插件版本不存在"),
    PLUGIN_VERSION_EXISTS(1003, "wiki.plugin.versionExists", "该插件版本已存在"),
    PLUGIN_FORBIDDEN(1004, "wiki.plugin.forbidden", "无权操作该插件"),
    PLUGIN_INVALID_STATE(1005, "wiki.plugin.invalidState", "插件当前状态不允许此操作"),
    PLUGIN_INVALID_VERSION(1006, "wiki.plugin.invalidVersion", "无效的插件语义化版本"),
    PLUGIN_REVIEW_REASON_REQUIRED(1007, "wiki.plugin.reviewReasonRequired", "驳回插件必须填写驳回原因"),
    PLUGIN_REVIEW_REASON_CODE_REQUIRED(1008, "wiki.plugin.reviewReasonCodeRequired", "驳回插件必须选择驳回原因分类"),
    PLUGIN_ALREADY_CLAIMED(1009, "wiki.plugin.alreadyClaimed", "该候选版本已被其他审核员认领"),
    PLUGIN_NOT_CLAIMED_BY_YOU(1010, "wiki.plugin.notClaimedByYou", "该候选版本未被您认领"),
    PLUGIN_QUOTA_EXCEEDED(1011, "wiki.plugin.quotaExceeded", "已安装插件数量已达套餐上限，请升级方案"),
    PLUGIN_SELF_RATING_FORBIDDEN(1012, "wiki.plugin.selfRatingForbidden", "不能给自己的插件评分"),
    PLUGIN_REPORT_HANDLED(1013, "wiki.plugin.reportHandled", "举报不存在或已处理"),
    PLUGIN_UNPUBLISH_REQUIRES_PUBLISHED(1014, "wiki.plugin.unpublishRequiresPublished", "仅已上架插件可下架"),
    PLUGIN_NOT_SUSPENDED(1015, "wiki.plugin.notSuspended", "插件未处于下架状态"),
    PLUGIN_SUSPENDED(1016, "wiki.plugin.suspended", "插件已下架"),
    PLUGIN_KEY_IMMUTABLE(1017, "wiki.plugin.keyImmutable", "pluginKey 不可修改"),
    PLUGIN_VERSION_NOT_NEWER(1018, "wiki.plugin.versionNotNewer", "新版本必须高于当前激活版本"),
    PLUGIN_UNKNOWN_CAPABILITY(1019, "wiki.plugin.unknownCapability", "未知的能力声明: {}"),
    PLUGIN_VERSION_DESCRIPTION_INVALID_JSON(1020, "wiki.plugin.versionDescriptionInvalidJson",
            "版本说明内容必须是合法 JSON"),
    PLUGIN_VERSION_REVIEW_ONLY(1021, "wiki.plugin.versionReviewOnly", "插件版本只能通过审核流程发布"),

    // Space related (2000-2999)
    SPACE_NOT_FOUND(2001, "wiki.space.notFound", "空间不存在"),
    SPACE_ALREADY_EXISTS(2002, "wiki.space.alreadyExists", "空间已存在"),
    PERSONAL_SPACE_CREATION_FAILED(2003, "wiki.space.personalCreationFailed", "个人空间创建失败"),
    SPACE_QUOTA_EXCEEDED(2004, "wiki.space.quotaExceeded", "空间数量已达套餐上限，请升级套餐后重试"),
    ENTITLEMENT_REQUIRED(2005, "wiki.space.entitlementRequired", "当前套餐不支持该功能，请升级方案"),
    MEMBER_QUOTA_EXCEEDED(2006, "wiki.space.memberQuotaExceeded", "空间成员数量已达套餐上限，请升级方案"),

    // Page related (3000-3999)
    PAGE_NOT_FOUND(3001, "wiki.page.notFound", "页面不存在"),
    PAGE_ALREADY_EXISTS(3002, "wiki.page.alreadyExists", "页面已存在"),
    PAGE_VERSION_NOT_FOUND(3003, "wiki.page.versionNotFound", "页面版本不存在"),
    UNPUBLISHED_PAGE_CANNOT_BE_TEMPLATE(3004, "wiki.page.unpublishedCannotBeTemplate", "未发布的页面不能保存为模板"),
    PAGE_PARENT_NOT_FOUND(3005, "wiki.page.parentNotFound", "父页面不存在"),
    NO_VERSION_TO_ROLLBACK(3006, "wiki.page.noVersionToRollback", "没有可回滚的版本"),
    CANNOT_ROLLBACK_TO_DRAFT(3007, "wiki.page.cannotRollbackToDraft", "不能回滚到草稿版本"),
    VERSION_ALREADY_ACTIVE(3008, "wiki.page.versionAlreadyActive", "该版本已经是当前激活版本"),
    INVALID_VERSION_COMPARISON(3009, "wiki.page.invalidVersionComparison", "无效的版本对比"),
    BLOCK_NOT_FOUND(3010, "wiki.page.blockNotFound", "块不存在"),
    VERSION_NOT_FOUND(3011, "wiki.page.versionMissing", "版本不存在"),
    CONTENT_PARSE_ERROR(3012, "wiki.page.contentParseError", "内容解析失败"),
    PAGE_CIRCULAR_MOVE(3013, "wiki.page.circularMove", "不能将页面移动到自身或其子页面下"),
    PAGE_WRITE_API_RETIRED(3014, "wiki.page.writeApiRetired", "旧页面写入接口已停用，请升级客户端"),
    PAGE_DOC_NOT_INITIALIZED(3015, "wiki.page.docNotInitialized", "页面尚未迁移到新文档存储"),
    PAGE_REVISION_CONFLICT(3016, "wiki.page.revisionConflict", "页面已被其他写入更新，请同步后重试"),

    // Collaboration related (4000-4999)
    INVITATION_NOT_FOUND(4001, "wiki.collaboration.invitationNotFound", "邀请不存在"),
    INVITATION_EXPIRED(4002, "wiki.collaboration.invitationExpired", "邀请已过期"),
    INVITATION_ALREADY_ACCEPTED(4003, "wiki.collaboration.invitationAlreadyAccepted", "邀请已被接受"),
    INVALID_INVITATION_STATUS(4004, "wiki.collaboration.invalidInvitationStatus", "无效的邀请状态"),
    COLLABORATOR_NOT_FOUND(4005, "wiki.collaboration.collaboratorNotFound", "协作者不存在"),
    FORBIDDEN_ACCESS(4006, "wiki.collaboration.forbiddenAccess", "无权访问"),
    SHARE_LINK_NOT_FOUND(4007, "wiki.collaboration.shareLinkNotFound", "分享链接不存在或已被重置"),
    SHARE_LINK_EXPIRED(4008, "wiki.collaboration.shareLinkExpired", "分享链接已过期"),
    SHARE_LINK_DISABLED(4009, "wiki.collaboration.shareLinkDisabled", "分享链接已关闭"),
    // The caller is not the page's session host. Every interactive write goes
    // through the host, so this is a normal, expected outcome for a collaborator —
    // not an error condition the user did anything to cause.
    NOT_SESSION_HOST(4010, "wiki.collaboration.notSessionHost", "当前不是该页面的编辑主持人，无法保存"),
    SESSION_ENDED(4011, "wiki.collaboration.sessionEnded", "编辑会话已结束"),

    // Validation related (6000-6999)
    INVALID_PARAMETER(6001, "wiki.validation.invalidParameter", "参数无效"),
    REQUIRED_PARAMETER_MISSING(6002, "wiki.validation.requiredParameterMissing", "缺少必需参数");

    private final int code;

    /** i18n key（i18n/messages*.properties）。 */
    private final String messageKey;

    /** 中文兜底文案：缺翻译/无消息源时使用。 */
    private final String defaultMessage;

    WikiException(int code, String messageKey, String defaultMessage) {
        this.code = code;
        this.messageKey = messageKey;
        this.defaultMessage = defaultMessage;
    }

    /** 按当前请求语言返回文案（见 {@link WikiMessages}）。 */
    @Override
    public String getMessage() {
        return WikiMessages.get(messageKey, defaultMessage);
    }
}
