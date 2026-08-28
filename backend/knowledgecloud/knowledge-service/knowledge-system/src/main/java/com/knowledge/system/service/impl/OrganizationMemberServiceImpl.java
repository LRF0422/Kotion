package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.OrganizationMember;
import com.knowledge.system.mapper.OrganizationMemberMapper;
import com.knowledge.system.service.IOrganizationMemberService;

@Service
public class OrganizationMemberServiceImpl
        extends ServiceImpl<OrganizationMemberMapper, OrganizationMember>
        implements IOrganizationMemberService {

    public static final int STATUS_ACTIVE = 1;

    @Override
    public OrganizationMember getActiveMember(String contextId, Long userId) {
        if (contextId == null || contextId.isEmpty() || userId == null) {
            return null;
        }
        return this.lambdaQuery()
                .eq(OrganizationMember::getTenantId, contextId)
                .eq(OrganizationMember::getUserId, userId)
                .eq(OrganizationMember::getStatus, STATUS_ACTIVE)
                .one();
    }

    @Override
    public boolean isActiveMember(String contextId, Long userId) {
        return getActiveMember(contextId, userId) != null;
    }
}
