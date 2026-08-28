package com.knowledge.system.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.system.domain.OrganizationMember;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.RolePermission;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserRole;
import com.knowledge.system.domain.dto.OrganizationCreateDTO;
import com.knowledge.system.domain.dto.OrganizationInviteDTO;
import com.knowledge.system.domain.enums.TenantType;
import com.knowledge.system.domain.vo.ContextVO;
import com.knowledge.system.domain.vo.OrganizationInvitationVO;
import com.knowledge.system.domain.vo.OrganizationMemberVO;
import com.knowledge.system.service.IAuthSessionService;
import com.knowledge.system.service.IOrganizationMemberService;
import com.knowledge.system.service.IRolePermissionService;
import com.knowledge.system.service.IRoleService;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserRoleService;
import com.knowledge.system.service.IUserService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.AllArgsConstructor;

@Service
@AllArgsConstructor
public class OrganizationApplication {

    public static final String PERSONAL_OWNER = "PERSONAL_OWNER";
    public static final String ORG_OWNER = "ORG_OWNER";
    public static final String ORG_ADMIN = "ORG_ADMIN";
    public static final String ORG_MEMBER = "ORG_MEMBER";
    public static final String ORG_GUEST = "ORG_GUEST";

    public static final int STATUS_INVITED = 0;
    public static final int STATUS_ACTIVE = 1;
    public static final int STATUS_SUSPENDED = 2;
    public static final int STATUS_LEFT = 3;

    private static final String SCOPE_ORGANIZATION = "ORGANIZATION";
    private static final long INVITATION_DAYS = 7L;

    private static final Map<String, List<String>> BUILT_IN_PERMISSIONS = createPermissionMap();

    private final ITenantService tenantService;
    private final IUserService userService;
    private final IAuthSessionService authSessionService;
    private final IOrganizationMemberService memberService;
    private final IRoleService roleService;
    private final IUserRoleService userRoleService;
    private final IRolePermissionService rolePermissionService;

    public List<ContextVO> listContexts(Long userId) {
        List<OrganizationMember> memberships = memberService.lambdaQuery()
                .eq(OrganizationMember::getUserId, userId)
                .eq(OrganizationMember::getStatus, STATUS_ACTIVE)
                .list();
        Map<String, OrganizationMember> byContext = memberships.stream()
                .collect(Collectors.toMap(OrganizationMember::getTenantId, Function.identity(), (left, right) -> left));

        User user = userService.getById(userId);
        String personalContextId = user == null ? null
                : StrUtil.blankToDefault(user.getPersonalContextId(), user.getTenantId());
        Tenant personalTenant = StrUtil.isBlank(personalContextId)
                ? null
                : tenantService.getByTenantId(personalContextId);
        if (personalTenant != null
                && personalTenant.getTenantType() == TenantType.INDIVIDUAL
                && !byContext.containsKey(personalContextId)) {
            OrganizationMember compatibility = new OrganizationMember();
            compatibility.setTenantId(personalContextId);
            compatibility.setUserId(userId);
            compatibility.setMemberRole(PERSONAL_OWNER);
            compatibility.setStatus(STATUS_ACTIVE);
            byContext.put(personalContextId, compatibility);
        }

        if (byContext.isEmpty()) {
            return Collections.emptyList();
        }
        Map<String, Tenant> tenants = tenantService.lambdaQuery()
                .in(Tenant::getTenantId, byContext.keySet())
                .list()
                .stream()
                .collect(Collectors.toMap(Tenant::getTenantId, Function.identity(), (left, right) -> left));
        return byContext.entrySet().stream()
                .map(entry -> {
                    Tenant tenant = tenants.get(entry.getKey());
                    if (tenant == null || Integer.valueOf(2).equals(tenant.getStatus())) {
                        return null;
                    }
                    return toContextVO(tenant, entry.getValue());
                })
                .filter(context -> context != null && context.getId() != null)
                .sorted((left, right) -> {
                    if (TenantType.INDIVIDUAL.getValue().equals(left.getType())) return -1;
                    if (TenantType.INDIVIDUAL.getValue().equals(right.getType())) return 1;
                    return left.getName().compareToIgnoreCase(right.getName());
                })
                .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public ContextVO createOrganization(Long userId, OrganizationCreateDTO dto) {
        User user = requireUser(userId);
        Tenant tenant = new Tenant();
        tenant.setTenantName(StrUtil.trim(dto.getName()));
        tenant.setDomain("");
        tenant.setTenantType(TenantType.TEAM);
        tenant.setOwnerUserId(userId);
        tenant.setStatus(STATUS_ACTIVE);
        tenantService.saveTenant(tenant);

        OrganizationMember member = new OrganizationMember();
        member.setTenantId(tenant.getTenantId());
        member.setUserId(userId);
        member.setMemberRole(ORG_OWNER);
        member.setStatus(STATUS_ACTIVE);
        member.setDisplayName(StrUtil.blankToDefault(user.getName(), user.getAccount()));
        member.setJoinedAt(LocalDateTime.now());
        memberService.save(member);
        assignBuiltInRole(userId, tenant.getTenantId(), ORG_OWNER);
        return toContextVO(tenant, member);
    }

    public List<OrganizationMemberVO> listMembers(Long userId, String contextId) {
        OrganizationMember requester = requireActiveMember(contextId, userId);
        if (ORG_GUEST.equals(requester.getMemberRole())) {
            throw new ServiceException("无权查看组织成员目录");
        }
        List<OrganizationMember> members = memberService.lambdaQuery()
                .eq(OrganizationMember::getTenantId, contextId)
                .in(OrganizationMember::getStatus, Arrays.asList(STATUS_INVITED, STATUS_ACTIVE, STATUS_SUSPENDED))
                .orderByAsc(OrganizationMember::getStatus)
                .orderByAsc(OrganizationMember::getId)
                .list();
        if (CollUtil.isEmpty(members)) {
            return Collections.emptyList();
        }
        List<Long> userIds = members.stream().map(OrganizationMember::getUserId).distinct().collect(Collectors.toList());
        Map<Long, User> users = userService.listByIds(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity(), (left, right) -> left));
        return members.stream().map(member -> toMemberVO(member, users.get(member.getUserId())))
                .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public OrganizationInvitationVO invite(Long inviterId, String contextId, OrganizationInviteDTO dto) {
        requireOrganizationManager(contextId, inviterId);
        String role = normalizeAssignableRole(dto.getRole());
        String normalizedAccount = normalizeAccount(dto.getAccount());
        List<User> users = userService.lambdaQuery()
                .and(wrapper -> wrapper
                        .eq(User::getNormalizedAccount, normalizedAccount)
                        .or()
                        .apply("LOWER(TRIM(account)) = {0}", normalizedAccount))
                .last("LIMIT 2")
                .list();
        if (users.size() != 1) {
            throw new ServiceException(users.isEmpty() ? "账号不存在" : "账号存在冲突，请联系平台运营人员处理");
        }
        User invitedUser = users.get(0);
        OrganizationMember existing = memberService.lambdaQuery()
                .eq(OrganizationMember::getTenantId, contextId)
                .eq(OrganizationMember::getUserId, invitedUser.getId())
                .one();
        if (existing != null && existing.getStatus() != null && existing.getStatus() == STATUS_ACTIVE) {
            throw new ServiceException("该用户已经是组织成员");
        }

        String rawToken = UUID.randomUUID().toString().replace("-", "");
        OrganizationMember invitation = existing == null ? new OrganizationMember() : existing;
        invitation.setTenantId(contextId);
        invitation.setUserId(invitedUser.getId());
        invitation.setMemberRole(role);
        invitation.setStatus(STATUS_INVITED);
        invitation.setDisplayName(StrUtil.blankToDefault(invitedUser.getName(), invitedUser.getAccount()));
        invitation.setInvitedBy(inviterId);
        invitation.setInvitationToken(hashToken(rawToken));
        invitation.setInvitationExpiresAt(LocalDateTime.now().plusDays(INVITATION_DAYS));
        memberService.saveOrUpdate(invitation);

        OrganizationInvitationVO result = new OrganizationInvitationVO();
        result.setToken(rawToken);
        result.setExpiresAt(invitation.getInvitationExpiresAt());
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ContextVO acceptInvitation(Long userId, String token) {
        OrganizationMember invitation = memberService.lambdaQuery()
                .eq(OrganizationMember::getInvitationToken, hashToken(token))
                .one();
        if (invitation == null || !userId.equals(invitation.getUserId())) {
            throw new ServiceException("邀请不存在或不属于当前账号");
        }
        if (Integer.valueOf(STATUS_ACTIVE).equals(invitation.getStatus())) {
            return toContextVO(tenantService.getByTenantId(invitation.getTenantId()), invitation);
        }
        if (!Integer.valueOf(STATUS_INVITED).equals(invitation.getStatus())
                || invitation.getInvitationExpiresAt() == null
                || invitation.getInvitationExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ServiceException("邀请已过期或已失效");
        }
        invitation.setStatus(STATUS_ACTIVE);
        invitation.setJoinedAt(LocalDateTime.now());
        // Keep only the one-way hash after acceptance so a lost response can be
        // retried idempotently by the intended account.
        memberService.updateById(invitation);
        assignBuiltInRole(userId, invitation.getTenantId(), invitation.getMemberRole());
        return toContextVO(tenantService.getByTenantId(invitation.getTenantId()), invitation);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateMemberRole(Long operatorId, String contextId, Long memberId, String requestedRole) {
        requireOrganizationManager(contextId, operatorId);
        String role = normalizeAssignableRole(requestedRole);
        OrganizationMember target = requireMember(contextId, memberId);
        if (ORG_OWNER.equals(target.getMemberRole())) {
            throw new ServiceException("组织所有者不能通过角色修改接口降级");
        }
        target.setMemberRole(role);
        memberService.updateById(target);
        assignBuiltInRole(target.getUserId(), contextId, role);
        invalidateCredentials(target.getUserId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void removeMember(Long operatorId, String contextId, Long memberId) {
        requireOrganizationManager(contextId, operatorId);
        OrganizationMember target = requireMember(contextId, memberId);
        if (ORG_OWNER.equals(target.getMemberRole())) {
            throw new ServiceException("不能移除组织所有者");
        }
        if (operatorId.equals(target.getUserId())) {
            throw new ServiceException("请使用离开组织操作");
        }
        deactivateMember(target);
    }

    @Transactional(rollbackFor = Exception.class)
    public void leave(Long userId, String contextId) {
        OrganizationMember member = requireActiveMember(contextId, userId);
        if (ORG_OWNER.equals(member.getMemberRole())) {
            throw new ServiceException("组织所有者必须先转移所有权");
        }
        deactivateMember(member);
    }

    @Transactional(rollbackFor = Exception.class)
    public void createPersonalMembership(User user, Tenant tenant) {
        OrganizationMember member = new OrganizationMember();
        member.setTenantId(tenant.getTenantId());
        member.setUserId(user.getId());
        member.setMemberRole(PERSONAL_OWNER);
        member.setStatus(STATUS_ACTIVE);
        member.setDisplayName(StrUtil.blankToDefault(user.getName(), user.getAccount()));
        member.setJoinedAt(LocalDateTime.now());
        memberService.save(member);
        assignBuiltInRole(user.getId(), tenant.getTenantId(), PERSONAL_OWNER);
    }

    private void deactivateMember(OrganizationMember member) {
        member.setStatus(STATUS_LEFT);
        member.setInvitationToken(null);
        member.setInvitationExpiresAt(null);
        memberService.updateById(member);
        userRoleService.remove(Wrappers.<UserRole>update().lambda()
                .eq(UserRole::getUserId, member.getUserId())
                .eq(UserRole::getScopeType, SCOPE_ORGANIZATION)
                .eq(UserRole::getScopeId, member.getTenantId()));
        invalidateCredentials(member.getUserId());
    }

    private void invalidateCredentials(Long userId) {
        userService.lambdaUpdate()
                .eq(User::getId, userId)
                .setSql("auth_version = auth_version + 1")
                .update();
        authSessionService.revokeUserSessions(Collections.singletonList(userId));
    }

    private void assignBuiltInRole(Long userId, String contextId, String roleCode) {
        Role role = roleService.lambdaQuery()
                .eq(Role::getTenantId, contextId)
                .eq(Role::getRoleKind, SCOPE_ORGANIZATION)
                .eq(Role::getBuiltIn, true)
                .eq(Role::getRoleCode, roleCode)
                .one();
        if (role == null) {
            role = new Role();
            role.setTenantId(contextId);
            role.setParentId(Role.ROOT_ROLE_PARENT_ID);
            role.setRoleName(roleCode);
            role.setRoleAlias(roleCode.toLowerCase(Locale.ROOT));
            role.setRoleCode(roleCode);
            role.setRoleKind(SCOPE_ORGANIZATION);
            role.setBuiltIn(true);
            role.setStatus(STATUS_ACTIVE);
            role.setSort(0);
            try {
                roleService.save(role);
                for (String permissionCode : BUILT_IN_PERMISSIONS.getOrDefault(roleCode, Collections.emptyList())) {
                    RolePermission permission = new RolePermission();
                    permission.setTenantId(contextId);
                    permission.setRoleId(role.getId());
                    permission.setPermissionCode(permissionCode);
                    rolePermissionService.save(permission);
                }
            } catch (DuplicateKeyException duplicate) {
                role = roleService.lambdaQuery()
                        .eq(Role::getTenantId, contextId)
                        .eq(Role::getRoleKind, SCOPE_ORGANIZATION)
                        .eq(Role::getBuiltIn, true)
                        .eq(Role::getRoleCode, roleCode)
                        .one();
                if (role == null) {
                    throw duplicate;
                }
            }
        }
        List<Long> currentRoleIds = userRoleService.listRoleIds(userId, SCOPE_ORGANIZATION, contextId);
        if (CollUtil.isNotEmpty(currentRoleIds)) {
            List<Long> builtInRoleIds = roleService.listByIds(currentRoleIds).stream()
                    .filter(current -> Boolean.TRUE.equals(current.getBuiltIn()))
                    .filter(current -> contextId.equals(current.getTenantId()))
                    .filter(current -> SCOPE_ORGANIZATION.equals(current.getRoleKind()))
                    .map(Role::getId)
                    .collect(Collectors.toList());
            if (CollUtil.isNotEmpty(builtInRoleIds)) {
                userRoleService.remove(Wrappers.<UserRole>update().lambda()
                        .eq(UserRole::getUserId, userId)
                        .eq(UserRole::getScopeType, SCOPE_ORGANIZATION)
                        .eq(UserRole::getScopeId, contextId)
                        .in(UserRole::getRoleId, builtInRoleIds));
            }
        }
        UserRole assignment = new UserRole();
        assignment.setTenantId(contextId);
        assignment.setUserId(userId);
        assignment.setRoleId(role.getId());
        assignment.setScopeType(SCOPE_ORGANIZATION);
        assignment.setScopeId(contextId);
        try {
            userRoleService.save(assignment);
        } catch (DuplicateKeyException ignored) {
            // Another concurrent acceptance already created the same scoped
            // assignment; V16 guarantees the existing row is equivalent.
        }
    }

    private OrganizationMember requireOrganizationManager(String contextId, Long userId) {
        Tenant tenant = tenantService.getByTenantId(contextId);
        if (tenant == null || tenant.getTenantType() != TenantType.TEAM) {
            throw new ServiceException("组织不存在");
        }
        OrganizationMember member = requireActiveMember(contextId, userId);
        if (!ORG_OWNER.equals(member.getMemberRole()) && !ORG_ADMIN.equals(member.getMemberRole())) {
            throw new ServiceException("无权管理组织成员");
        }
        return member;
    }

    private OrganizationMember requireActiveMember(String contextId, Long userId) {
        OrganizationMember member = memberService.getActiveMember(contextId, userId);
        if (member == null) {
            throw new ServiceException("不是当前组织的有效成员");
        }
        return member;
    }

    private OrganizationMember requireMember(String contextId, Long memberId) {
        OrganizationMember member = memberService.lambdaQuery()
                .eq(OrganizationMember::getTenantId, contextId)
                .eq(OrganizationMember::getId, memberId)
                .one();
        if (member == null) {
            throw new ServiceException("组织成员不存在");
        }
        return member;
    }

    private User requireUser(Long userId) {
        User user = userService.getById(userId);
        if (user == null) {
            throw new ServiceException("用户不存在");
        }
        return user;
    }

    private String normalizeAssignableRole(String role) {
        String normalized = StrUtil.blankToDefault(role, ORG_MEMBER).trim().toUpperCase();
        if (!ORG_ADMIN.equals(normalized) && !ORG_MEMBER.equals(normalized) && !ORG_GUEST.equals(normalized)) {
            throw new ServiceException("组织角色无效");
        }
        return normalized;
    }

    private String normalizeAccount(String account) {
        return StrUtil.trim(account).toLowerCase(Locale.ROOT);
    }

    private ContextVO toContextVO(Tenant tenant, OrganizationMember membership) {
        ContextVO vo = new ContextVO();
        vo.setId(membership.getTenantId());
        vo.setName(tenant == null ? membership.getTenantId() : tenant.getTenantName());
        vo.setType(tenant == null || tenant.getTenantType() == null
                ? TenantType.INDIVIDUAL.getValue()
                : tenant.getTenantType().getValue());
        vo.setOwnerUserId(tenant == null ? null : tenant.getOwnerUserId());
        vo.setStatus(tenant == null || tenant.getStatus() == null ? STATUS_ACTIVE : tenant.getStatus());
        vo.setMemberRole(membership.getMemberRole());
        return vo;
    }

    private OrganizationMemberVO toMemberVO(OrganizationMember member, User user) {
        OrganizationMemberVO vo = new OrganizationMemberVO();
        vo.setId(member.getId());
        vo.setUserId(member.getUserId());
        vo.setMemberRole(member.getMemberRole());
        vo.setStatus(member.getStatus());
        vo.setDisplayName(member.getDisplayName());
        vo.setJobTitle(member.getJobTitle());
        vo.setJoinedAt(member.getJoinedAt());
        vo.setInvitationExpiresAt(member.getInvitationExpiresAt());
        if (user != null) {
            vo.setAccount(user.getAccount());
            vo.setName(user.getName());
            vo.setAvatar(user.getAvatar());
        }
        return vo;
    }

    private String hashToken(String token) {
        if (StrUtil.isBlank(token)) {
            throw new ServiceException("邀请 token 不能为空");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                result.append(String.format("%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static Map<String, List<String>> createPermissionMap() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        result.put(PERSONAL_OWNER, Collections.singletonList("org.read"));
        result.put(ORG_OWNER, Arrays.asList(
                "org.read", "org.settings.read", "org.settings.update",
                "org.members.read", "org.members.invite", "org.members.update",
                "org.members.suspend", "org.members.remove",
                "org.departments.read", "org.departments.manage",
                "org.roles.read", "org.roles.manage", "org.owner.transfer", "org.delete"));
        result.put(ORG_ADMIN, Arrays.asList(
                "org.read", "org.settings.read", "org.settings.update",
                "org.members.read", "org.members.invite", "org.members.update",
                "org.members.suspend", "org.members.remove",
                "org.departments.read", "org.departments.manage",
                "org.roles.read", "org.roles.manage"));
        result.put(ORG_MEMBER, Arrays.asList("org.read", "org.members.read"));
        result.put(ORG_GUEST, Collections.singletonList("org.read"));
        return result;
    }
}
