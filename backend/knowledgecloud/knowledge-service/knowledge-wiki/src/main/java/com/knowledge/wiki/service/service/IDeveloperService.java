package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.Developer;

public interface IDeveloperService extends MPJBaseService<Developer> {

    Developer getByUserId(Long userId);
}
