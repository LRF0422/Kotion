package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.Organization;
import com.knowledge.system.mapper.OrganizationMapper;
import com.knowledge.system.service.IOrganizationService;

@Service
public class OrganizationServiceImpl extends BaseService<OrganizationMapper, Organization>
        implements IOrganizationService {

}
