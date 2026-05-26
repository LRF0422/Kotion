package com.knowledge.system.application;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.RegisterDTO;
import com.knowledge.system.domain.enums.TenantType;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserService;

@Service
public class AdminApplication {

    @Autowired
    private IUserService userService;
    @Autowired
    private ITenantService tenantService;

    public void register(RegisterDTO dto) {
        Tenant tenant = new Tenant();
        tenant.setDomain("");
        tenant.setTenantType(TenantType.INDIVIDUAL);
        tenant.setTenantName(dto.getAccount());
        tenantService.saveTenant(tenant);
        User user = UserConverter.INSTANCE.convert(dto);
        user.setTenantId(tenant.getTenantId());
        userService.createUser(user);
    }

}
