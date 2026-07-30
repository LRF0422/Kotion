package com.knowledge.core.log.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.log.entity.LogLoginDO;
import com.knowledge.core.log.mapper.LogLoginMapper;
import com.knowledge.core.log.service.ILogLoginService;
import org.springframework.stereotype.Service;

/**
 * 登录日志服务实现类
 *
 * @author jiang
 */
@Service
public class LogLoginServiceImpl extends ServiceImpl<LogLoginMapper, LogLoginDO> implements ILogLoginService {

}
