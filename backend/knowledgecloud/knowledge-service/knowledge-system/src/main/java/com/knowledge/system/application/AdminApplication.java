package com.knowledge.system.application;

import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.RegisterDTO;
import com.knowledge.system.domain.enums.TenantType;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserService;

import cn.hutool.core.util.StrUtil;

@Service
public class AdminApplication {

    @Autowired
    private IUserService userService;
    @Autowired
    private ITenantService tenantService;
    @Autowired
    private OrganizationApplication organizationApplication;

    @Transactional(rollbackFor = Exception.class)
    public void register(RegisterDTO dto) {
        String account = StrUtil.trim(dto.getAccount());
        if (StrUtil.isBlank(account)) {
            throw new ServiceException("账号不能为空");
        }
        if (userService.existsByAccount(account)) {
            throw new ServiceException("用户名已存在");
        }

        Tenant tenant = new Tenant();
        tenant.setDomain("");
        tenant.setTenantType(TenantType.INDIVIDUAL);
        tenant.setTenantName(account);
        tenant.setStatus(1);
        tenantService.saveTenant(tenant);

        User user = UserConverter.INSTANCE.convert(dto);
        user.setAccount(account);
        user.setNormalizedAccount(account.toLowerCase(Locale.ROOT));
        user.setTenantId(tenant.getTenantId());
        user.setPersonalContextId(tenant.getTenantId());
        user.setAuthVersion(0);
        user.setStatus(1);
        userService.createUser(user);

        tenant.setOwnerUserId(user.getId());
        tenantService.saveTenant(tenant);
        organizationApplication.createPersonalMembership(user, tenant);
    }

}
