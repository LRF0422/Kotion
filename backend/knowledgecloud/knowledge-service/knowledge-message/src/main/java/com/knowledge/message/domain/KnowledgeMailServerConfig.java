package com.knowledge.message.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_mail_server_config")
public class KnowledgeMailServerConfig extends TenantItemImpl {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private String host;
    private Integer port;
    private String username;
    private String password;
}
