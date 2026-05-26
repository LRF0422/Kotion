package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.system.domain.action.ActionConfig;
import com.knowledge.system.mapper.ActionConfigMapper;
import com.knowledge.system.service.IActionConfigService;

@Service
public class ActionConfigServiceImpl extends BaseService<ActionConfigMapper, ActionConfig>
        implements IActionConfigService {

    @Override
    public ActionConfig getByDbNameAndTableName(String dbName, String tableName) {
        return this.lambdaQuery()
                .eq(ActionConfig::getDbName, dbName)
                .eq(ActionConfig::getTableName, tableName)
                .one();
    }

}
