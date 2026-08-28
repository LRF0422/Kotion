package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.OrganizationMember;

public interface IOrganizationMemberService extends IService<OrganizationMember> {

    OrganizationMember getActiveMember(String contextId, Long userId);

    boolean isActiveMember(String contextId, Long userId);
}
