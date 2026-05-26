package com.knowledge.system.domain.action.parser;

import java.io.Serializable;
import java.util.Map;

import com.knowledge.system.domain.action.ActionConfig;

public abstract class AbstractConfigParser implements ConfigParser {

    protected final ActionConfig config;
    protected final Map<String, Object> data;

    public AbstractConfigParser(ActionConfig config, Map<String, Object> data) {
        this.config = config;
        this.data = data;
    }

}
