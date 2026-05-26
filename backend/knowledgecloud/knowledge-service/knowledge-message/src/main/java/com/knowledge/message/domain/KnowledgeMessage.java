package com.knowledge.message.domain;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.core.message.core.message.MessageType;
import com.knowledge.message.domain.enums.MessageStatus;

import cn.hutool.json.JSONObject;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName(value = "knowledge_message", autoResultMap = true)
public class KnowledgeMessage extends TenantItemImpl {

    private Long id;
    private Long sendUserId;
    private Long userId;
    private String title;
    private String body;
    private boolean success;
    private boolean resendOnFail;
    private String failMessage;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JSONObject params;
    private MessageType messageType;
    private String description;
    private String url;
    private MessageStatus status = MessageStatus.UNREAD;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Icon icon;
}
