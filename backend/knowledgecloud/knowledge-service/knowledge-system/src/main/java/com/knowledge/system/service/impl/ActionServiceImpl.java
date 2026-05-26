package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.action.Action;
import com.knowledge.system.mapper.ActionMapper;
import com.knowledge.system.service.IActionService;

@Service
public class ActionServiceImpl extends BaseService<ActionMapper, Action> implements IActionService {

}
