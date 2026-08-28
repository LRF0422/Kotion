package com.knowledge.system.feign;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.User;
import com.knowledge.system.dto.GrantRolesDTO;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.service.IOrganizationMemberService;
import com.knowledge.system.service.IRolePermissionService;
import com.knowledge.system.service.IRoleService;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserRoleService;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserInfo;
import com.knowledge.system.vo.UserVO;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import cn.hutool.core.util.StrUtil;

@RestController
public class UserClient implements IUserClient {

    @Autowired
    private IUserService userService;
    @Autowired
    private ITenantService tenantService;
    @Autowired
    private IUserRoleService userRoleService;
    @Autowired
    private IRoleService roleService;
    @Autowired
    private IRolePermissionService rolePermissionService;
    @Autowired
    private IOrganizationMemberService organizationMemberService;

    @Override
    @PreAuthorize("hasRole('service') and principal.account == 'internal-service' and principal.userId.toString() == '-1'")
    public R<UserInfo> userInfo(Long userId) {
        User user = userService.userInfo(userId);
        if (user == null) {
            return R.fail("User not found");
        }
        return R.data(buildUserInfo(user));
    }

    @Override
    @PreAuthorize("hasRole('service') and principal.account == 'internal-service' and principal.userId.toString() == '-1'")
    public R<UserInfo> userInfo(Long userId, String contextId) {
        User user = userService.userInfo(userId);
        if (user == null) {
            return R.fail("User not found");
        }
        if (Integer.valueOf(2).equals(user.getStatus())) {
            return R.fail("User disabled");
        }
        Tenant context = tenantService.getByTenantId(contextId);
        if (context == null || Integer.valueOf(2).equals(context.getStatus())) {
            return R.fail("Context disabled or unavailable");
        }
        String personalContextId = StrUtil.blankToDefault(user.getPersonalContextId(), user.getTenantId());
        boolean personalContext = contextId.equals(personalContextId)
                && context.getTenantType() == com.knowledge.system.domain.enums.TenantType.INDIVIDUAL;
        boolean platformContext = KnowledgeConstant.ADMIN_TENANT_ID.equals(contextId)
                && CollUtil.isNotEmpty(userRoleService.listRoleIds(userId, "PLATFORM", contextId));
        if (!personalContext
                && !platformContext
                && !organizationMemberService.isActiveMember(contextId, userId)) {
            return R.fail("Context not available");
        }
        return R.data(buildUserInfo(user, contextId));
    }

    @Override
    @PreAuthorize("hasRole('service') and principal.account == 'internal-service' and principal.userId.toString() == '-1'")
    public R<UserInfo> userInfo(String tenantId, String account, String password) {
        User user = userService.userInfo(tenantId, account, password);
        if (user == null) {
            return R.fail("User not found");
        }
        String contextId = StrUtil.blankToDefault(user.getPersonalContextId(), user.getTenantId());
        Tenant context = tenantService.getByTenantId(contextId);
        if (context == null || Integer.valueOf(2).equals(context.getStatus())) {
            return R.fail("Context disabled or unavailable");
        }
        if (context.getTenantType() == com.knowledge.system.domain.enums.TenantType.TEAM
                && !organizationMemberService.isActiveMember(contextId, user.getId())) {
            return R.fail("Organization membership inactive");
        }
        return R.data(buildUserInfo(user, contextId));
    }

    @Override
    public R<IPage<KnowledgeUser>> list(QueryUserDTO dto) {
        IPage<User> userPage = userService.userList(dto);
        return R.data(UserConverter.INSTANCE.convertKnowledgeUserPage(userPage));
    }

    @Override
    @PreAuthorize("hasRole('service') and principal.account == 'internal-service' and principal.userId.toString() == '-1'")
    public R<?> grantRoles(GrantRolesDTO dto) {
        String roleIds = dto.getRoleIds().stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
        boolean success = userService.grant(dto.getUserId() + "", roleIds);
        return success ? R.success("Roles granted successfully") : R.fail("Failed to grant roles");
    }

    @Override
    public R<List<KnowledgeUser>> listByIds(List<Long> ids) {
        if (CollUtil.isEmpty(ids)) {
            return R.data(ListUtil.empty());
        }
        List<User> users = userService.listByIds(ids);
        return R.data(UserConverter.INSTANCE.converKnowledgeUser(users));
    }

    @Override
    public R<KnowledgeUser> getUserById(Long id) {
        User user = userService.getById(id);
        if (user == null) {
            return R.fail("User not found");
        }
        return R.data(UserConverter.INSTANCE.convertKnowledgeUser(user));
    }

    @Override
    public R<List<KnowledgeUser>> getByAccount(List<String> accounts) {
        if (CollUtil.isEmpty(accounts)) {
            return R.data(ListUtil.empty());
        }
        List<User> users = userService.lambdaQuery()
                .in(User::getAccount, accounts)
                .list();
        return R.data(UserConverter.INSTANCE.converKnowledgeUser(users));
    }

    @Override
    public R<IPage<KnowledgeUser>> searchUsers(String keyword, Integer pageSize) {
        QueryUserDTO queryUserDTO = new QueryUserDTO();
        queryUserDTO.setSize(pageSize != null ? pageSize : 10);
        queryUserDTO.setCurrent(1);
        queryUserDTO.setSearchValue(keyword);
        IPage<User> userPage = userService.userList(queryUserDTO);
        return R.data(UserConverter.INSTANCE.convertKnowledgeUserPage(userPage));
    }

    private UserInfo buildUserInfo(User user) {
        return buildUserInfo(user, StrUtil.blankToDefault(user.getPersonalContextId(), user.getTenantId()));
    }

    private UserInfo buildUserInfo(User user, String contextId) {
        UserVO userVO = UserConverter.INSTANCE.convert(user);
        UserInfo userInfo = new UserInfo();
        userInfo.setUser(userVO);
        userInfo.setCurrentContextId(contextId);
        Tenant tenant = StrUtil.isBlank(userInfo.getCurrentContextId())
                ? null
                : tenantService.getByTenantId(userInfo.getCurrentContextId());
        if (tenant != null && tenant.getTenantType() != null) {
            userInfo.setCurrentContextType(tenant.getTenantType().getValue());
        }
        userInfo.setAuthVersion(user.getAuthVersion() == null ? 0 : user.getAuthVersion());

        String scopeType = KnowledgeConstant.ADMIN_TENANT_ID.equals(userInfo.getCurrentContextId())
                ? "PLATFORM"
                : "ORGANIZATION";
        List<Long> scopedRoleIds = userRoleService.listRoleIds(
                user.getId(), scopeType, userInfo.getCurrentContextId());
        if (CollUtil.isNotEmpty(scopedRoleIds)) {
            List<Role> roles = roleService.listByIds(scopedRoleIds).stream()
                    .filter(role -> userInfo.getCurrentContextId().equals(role.getTenantId()))
                    .filter(role -> scopeType.equals(role.getRoleKind()))
                    .filter(role -> role.getStatus() == null || Integer.valueOf(1).equals(role.getStatus()))
                    .collect(Collectors.toList());
            List<Long> validatedRoleIds = roles.stream().map(Role::getId).collect(Collectors.toList());
            userInfo.setRoles(roles.stream()
                    .map(role -> StrUtil.isNotBlank(role.getRoleCode()) ? role.getRoleCode() : role.getRoleAlias())
                    .filter(StrUtil::isNotBlank)
                    .distinct()
                    .collect(Collectors.toList()));
            userInfo.setPermissions(rolePermissionService.listPermissionCodes(validatedRoleIds));
        } else if (contextId.equals(user.getTenantId())) {
            // Legacy role aliases are only valid in the user's original tenant.
            // Never project them into a different organization context.
            userInfo.setRoles(userService.getRoleAlias(user.getTenantId(), user.getRoleId()));
        } else {
            userInfo.setRoles(java.util.Collections.emptyList());
            userInfo.setPermissions(java.util.Collections.emptyList());
        }
        return userInfo;
    }

}
