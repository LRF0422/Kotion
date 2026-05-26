package com.knowledge.core.mp.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.knowledge.core.secure.utils.SecureUtil;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@Component
public class KnowledgeMetaObjectHandler implements MetaObjectHandler {

	@Override
	public void insertFill(MetaObject metaObject) {
		log.info("start insert fill ....");
		this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now()); // 起始版本 3.3.0(推荐使用)
		this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now()); // 起始版本 3.3.0(推荐)
		this.strictInsertFill(metaObject, "createUser", Long.class, SecureUtil.getUserId()); // 起始版本 3.3.0(推荐使用)
		this.strictInsertFill(metaObject, "updateUser", Long.class, SecureUtil.getUserId()); // 起始版本 3.3.0(推荐使用)
		this.strictInsertFill(metaObject, "isDeleted", Integer.class, 0);
		this.strictInsertFill(metaObject, "tenantId", String.class, SecureUtil.getTenantId());
	}

	@Override
	public void updateFill(MetaObject metaObject) {
		log.info("start update fill ....");
		this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now()); // 起始版本 3.3.0(推荐)
		this.strictUpdateFill(metaObject, "updateUser", Long.class, SecureUtil.getUserId()); // 起始版本 3.3.0(推荐)
	}
}
