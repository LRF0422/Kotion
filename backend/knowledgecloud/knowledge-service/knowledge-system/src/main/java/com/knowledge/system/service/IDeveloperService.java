package com.knowledge.system.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.system.domain.Developer;

public interface IDeveloperService extends MPJBaseService<Developer> {

    Developer getByUserId(Long userId);
}
