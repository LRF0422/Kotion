package com.knowledge.system.service;

import java.util.Map;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.github.yulichang.base.MPJBaseService;
import com.knowledge.core.common.base.Pageable;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserGroup;
import com.knowledge.system.domain.dto.QueryGroupUserDTO;

public interface IUserGroupService extends MPJBaseService<UserGroup> {

    IPage<User> getGroupUsers(QueryGroupUserDTO pageable);
}
