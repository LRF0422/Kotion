package com.knowledge.system.service;

import com.knowledge.core.common.base.IBaseService;
import com.knowledge.system.domain.action.ActionConfig;

public interface IActionConfigService extends IBaseService<ActionConfig> {

    ActionConfig getByDbNameAndTableName(String dbName, String tableName);

}
