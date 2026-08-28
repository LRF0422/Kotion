package com.knowledge.system.service.impl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.common.constant.CommonConstant;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.core.tool.utils.DigestUtil;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.StringUtil;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserRole;
import com.knowledge.system.domain.dto.AdminUserSubmitDTO;
import com.knowledge.system.domain.dto.MeProfileUpdateDTO;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.mapper.UserMapper;
import com.knowledge.system.service.IAuthSessionService;
import com.knowledge.system.service.IRoleService;
import com.knowledge.system.service.IUserRoleService;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserVO;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.AllArgsConstructor;

/**
 * 用户服务实现类。
 */
@Service
@AllArgsConstructor
public class UserServiceImpl extends MPJBaseServiceImpl<UserMapper, User> implements IUserService {

    private static final int DEFAULT_PAGE_SIZE = 10;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int STATUS_ACTIVE = 1;
    private static final int STATUS_DISABLED = 2;

    private final IRoleService roleService;
    private final IUserRoleService userRoleService;
    private final IAuthSessionService authSessionService;

    @Override
    public boolean submit(User user) {
        if (Func.isNotEmpty(user.getPassword())) {
            user.setPassword(DigestUtil.encrypt(user.getPassword()));
        }
        user.setAccount(StrUtil.trim(user.getAccount()));
        user.setNormalizedAccount(normalizeAccount(user.getAccount()));
        Long cnt = baseMapper.selectCount(Wrappers.<User>query().lambda()
                .and(wrapper -> wrapper
                        .eq(User::getNormalizedAccount, user.getNormalizedAccount())
                        .or()
                        .apply("LOWER(TRIM(account)) = {0}", user.getNormalizedAccount()))
                .ne(user.getId() != null, User::getId, user.getId()));
        if (cnt > 0) {
            throw new ServiceException("当前用户已存在!");
        }
        try {
            return saveOrUpdate(user);
        } catch (DuplicateKeyException error) {
            throw new ServiceException("当前用户已存在!");
        }
    }

    @Override
    public IPage<User> selectUserPage(IPage<User> page, User user) {
        return page.setRecords(baseMapper.selectUserPage(page, user));
    }

    @Override
    public IPage<User> userList(QueryUserDTO dto) {
        int current = normalizeCurrent(dto.getCurrent());
        int size = normalizeSize(dto.getSize());
        String tenantId = SecurityContextUtil.getTenantId();
        String keyword = StrUtil.trim(dto.getSearchValue());
        return this.lambdaQuery()
                .eq(StrUtil.isNotBlank(tenantId), User::getTenantId, tenantId)
                .eq(dto.getStatus() != null, User::getStatus, dto.getStatus())
                .apply(StrUtil.isNotBlank(dto.getRoleId()), "FIND_IN_SET({0}, role_id)", dto.getRoleId())
                .and(StrUtil.isNotBlank(keyword), wrapper -> wrapper
                        .like(User::getName, keyword)
                        .or()
                        .like(User::getRealName, keyword)
                        .or()
                        .like(User::getAccount, keyword)
                        .or()
                        .like(User::getEmail, keyword)
                        .or()
                        .like(User::getPhone, keyword))
                .orderByDesc(User::getId)
                .page(new Page<>(current, size));
    }

    @Override
    public IPage<UserVO> adminUserList(QueryUserDTO dto) {
        String tenantId = requireTenantId();
        int current = normalizeCurrent(dto.getCurrent());
        int size = normalizeSize(dto.getSize());
        String keyword = StrUtil.trim(dto.getSearchValue());
        IPage<User> page = this.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .eq(dto.getStatus() != null, User::getStatus, dto.getStatus())
                .apply(StrUtil.isNotBlank(dto.getRoleId()), "FIND_IN_SET({0}, role_id)", dto.getRoleId())
                .and(StrUtil.isNotBlank(keyword), wrapper -> wrapper
                        .like(User::getName, keyword)
                        .or()
                        .like(User::getRealName, keyword)
                        .or()
                        .like(User::getAccount, keyword)
                        .or()
                        .like(User::getEmail, keyword)
                        .or()
                        .like(User::getPhone, keyword))
                .orderByDesc(User::getId)
                .page(new Page<>(current, size));
        return page.convert(user -> toAdminVO(user, tenantId));
    }

    @Override
    public UserVO adminUserDetail(Long userId) {
        String tenantId = requireTenantId();
        User user = requireTenantUser(userId, tenantId);
        return toAdminVO(user, tenantId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserVO submitAdminUser(AdminUserSubmitDTO dto) {
        String tenantId = requireTenantId();
        String account = StrUtil.trim(dto.getAccount());
        if (StrUtil.isBlank(account)) {
            throw new ServiceException("账号不能为空");
        }

        if (dto.getId() == null) {
            if (StrUtil.isBlank(dto.getPassword())) {
                throw new ServiceException("初始密码不能为空");
            }
            String roleIds = normalizeRoleIds(tenantId, dto.getRoleIds());
            assertAccountAvailable(tenantId, account, null);

            User user = new User();
            user.setTenantId(tenantId);
            user.setAccount(account);
            user.setNormalizedAccount(normalizeAccount(account));
            user.setName(StrUtil.isBlank(dto.getName()) ? account : StrUtil.trim(dto.getName()));
            user.setRealName(StrUtil.trim(dto.getRealName()));
            user.setEmail(StrUtil.trim(dto.getEmail()));
            user.setPhone(StrUtil.trim(dto.getPhone()));
            user.setPassword(DigestUtil.encrypt(dto.getPassword()));
            user.setRoleId(roleIds);
            user.setStatus(STATUS_ACTIVE);
            user.setIsSetup(false);
            try {
                this.save(user);
            } catch (DuplicateKeyException error) {
                throw new ServiceException("当前用户已存在!");
            }
            return toAdminVO(user, tenantId);
        }

        if (StrUtil.isNotBlank(dto.getPassword())) {
            throw new ServiceException("编辑用户资料不能修改密码");
        }
        User user = requireTenantUser(dto.getId(), tenantId);
        assertAccountAvailable(tenantId, account, user.getId());
        user.setAccount(account);
        user.setNormalizedAccount(normalizeAccount(account));
        user.setName(StrUtil.isBlank(dto.getName()) ? account : StrUtil.trim(dto.getName()));
        user.setRealName(StrUtil.trim(dto.getRealName()));
        user.setEmail(StrUtil.trim(dto.getEmail()));
        user.setPhone(StrUtil.trim(dto.getPhone()));
        try {
            this.updateById(user);
        } catch (DuplicateKeyException error) {
            throw new ServiceException("当前用户已存在!");
        }
        return toAdminVO(user, tenantId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeAdminUsers(String userIds) {
        List<Long> ids = requireAdminTargets(userIds, false);
        boolean removed = this.remove(Wrappers.<User>update().lambda()
                .eq(User::getTenantId, requireTenantId())
                .in(User::getId, ids));
        if (removed) {
            authSessionService.revokeUserSessions(ids);
        }
        return removed;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean grantAdminRoles(String userIds, String roleIds) {
        String tenantId = requireTenantId();
        List<Long> ids = requireAdminTargets(userIds, false);
        String normalizedRoleIds = normalizeRoleIds(tenantId, parseIds(roleIds, "角色"));
        boolean updated = this.update(Wrappers.<User>update().lambda()
                .set(User::getRoleId, normalizedRoleIds)
                .setSql("auth_version = auth_version + 1")
                .eq(User::getTenantId, tenantId)
                .in(User::getId, ids));
        if (updated) {
            List<Long> scopedRoleIds = parseIds(normalizedRoleIds, "角色");
            syncScopedRoles(ids, scopedRoleIds, tenantId);
            authSessionService.revokeUserSessions(ids);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean resetAdminPasswords(String userIds) {
        String tenantId = requireTenantId();
        List<Long> ids = requireAdminTargets(userIds, false);
        boolean updated = this.update(Wrappers.<User>update().lambda()
                .set(User::getPassword, DigestUtil.encrypt(CommonConstant.DEFAULT_PASSWORD))
                .setSql("auth_version = auth_version + 1")
                .eq(User::getTenantId, tenantId)
                .in(User::getId, ids));
        if (updated) {
            authSessionService.revokeUserSessions(ids);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean setAdminUserStatus(String userIds, Integer status) {
        if (status == null || (status != STATUS_ACTIVE && status != STATUS_DISABLED)) {
            throw new ServiceException("用户状态无效");
        }
        String tenantId = requireTenantId();
        List<Long> ids = requireAdminTargets(userIds, false);
        boolean updated = this.update(Wrappers.<User>update().lambda()
                .set(User::getStatus, status)
                .setSql(status == STATUS_DISABLED, "auth_version = auth_version + 1")
                .eq(User::getTenantId, tenantId)
                .in(User::getId, ids));
        if (updated && status == STATUS_DISABLED) {
            authSessionService.revokeUserSessions(ids);
        }
        return updated;
    }

    @Override
    public User userInfo(Long userId) {
        return baseMapper.selectById(userId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserVO updateCurrentProfile(Long userId, MeProfileUpdateDTO dto) {
        User user = this.getById(userId);
        if (user == null) {
            throw new ServiceException("用户不存在");
        }
        user.setName(StrUtil.trim(dto.getName()));
        user.setRealName(StrUtil.trim(dto.getRealName()));
        user.setAvatar(StrUtil.trim(dto.getAvatar()));
        this.updateById(user);
        return UserConverter.INSTANCE.convert(user);
    }

    @Override
    public User userInfo(String tenantId, String account, String password) {
        String normalizedAccount = normalizeAccount(account);
        List<User> matches = this.lambdaQuery()
                .and(wrapper -> wrapper
                        .eq(User::getNormalizedAccount, normalizedAccount)
                        .or()
                        .eq(User::getAccount, StrUtil.trim(account)))
                .eq(User::getPassword, password)
                .last("LIMIT 2")
                .list();
        if (matches.size() == 1) {
            User matched = matches.get(0);
            if (StrUtil.isNotBlank(tenantId) && !tenantId.equals(matched.getTenantId())) {
                return null;
            }
            return matched;
        }
        if (matches.size() > 1) {
            throw new ServiceException("账号存在冲突，请联系平台运营人员处理");
        }
        return null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean grant(String userIds, String roleIds) {
        List<Long> targetUserIds = Func.toLongList(userIds);
        List<Long> targetRoleIds = Func.toLongList(roleIds);
        if (targetUserIds.isEmpty()) {
            return false;
        }
        boolean updated = this.update(Wrappers.<User>update().lambda()
                .set(User::getRoleId, roleIds)
                .setSql("auth_version = auth_version + 1")
                .in(User::getId, targetUserIds));
        if (updated) {
            String scopeId = targetRoleIds.isEmpty()
                    ? this.getById(targetUserIds.get(0)).getTenantId()
                    : roleService.getById(targetRoleIds.get(0)).getTenantId();
            syncScopedRoles(targetUserIds, targetRoleIds, scopeId);
            authSessionService.revokeUserSessions(targetUserIds);
        }
        return updated;
    }

    @Override
    public boolean resetPassword(String userIds) {
        User user = new User();
        user.setPassword(DigestUtil.encrypt(CommonConstant.DEFAULT_PASSWORD));
        return this.update(user, Wrappers.<User>update().lambda().in(User::getId, Func.toLongList(userIds)));
    }

    @Override
    public boolean updatePassword(Long userId, String oldPassword, String newPassword, String newPassword1) {
        if (!newPassword.equals(newPassword1)) {
            throw new ServiceException("请输入正确的确认密码!");
        }
        String oldPasswordHash = DigestUtil.encrypt(oldPassword);
        boolean updated = this.update(Wrappers.<User>update().lambda()
                .set(User::getPassword, DigestUtil.encrypt(newPassword))
                .setSql("auth_version = auth_version + 1")
                .eq(User::getId, userId)
                .eq(User::getPassword, oldPasswordHash));
        if (!updated) {
            throw new ServiceException("原密码不正确或已被修改!");
        }
        authSessionService.revokeUserSessions(Collections.singletonList(userId));
        return true;
    }

    @Override
    public List<String> getRoleName(String roleIds) {
        return resolveRoleValues(requireTenantId(), roleIds, false);
    }

    @Override
    public List<String> getRoleAlias(String tenantId, String roleIds) {
        return resolveRoleValues(tenantId, roleIds, true);
    }

    @Override
    public List<String> getDeptName(String deptIds) {
        if (StrUtil.isBlank(deptIds)) {
            return new ArrayList<>();
        }
        return baseMapper.getDeptName(Func.toStrArray(deptIds));
    }

    @Override
    public boolean existsByAccount(String account) {
        return this.lambdaQuery()
                .and(wrapper -> wrapper
                        .eq(User::getNormalizedAccount, normalizeAccount(account))
                        .or()
                        .apply("LOWER(TRIM(account)) = {0}", normalizeAccount(account)))
                .exists();
    }

    @Override
    public void setup(String account, String avatar, String nickName, String realName, String password) {
        this.lambdaUpdate()
                .eq(User::getAccount, account)
                .eq(User::getTenantId, SecurityContextUtil.getTenantId())
                .set(User::getRealName, realName)
                .set(User::getName, nickName)
                .set(User::getAvatar, avatar)
                .set(User::getPassword, DigestUtil.encrypt(password))
                .set(User::getIsSetup, true)
                .update();
    }

    @Override
    public List<User> getUsersWithRole(Long roleId) {
        MPJLambdaWrapper<User> wrapper = MPJWrappers.lambdaJoin(User.class);
        wrapper.leftJoin(UserRole.class, UserRole::getUserId, User::getId)
                .leftJoin(Role.class, Role::getId, UserRole::getRoleId)
                .eq(Role::getId, roleId);
        return this.selectJoinList(User.class, wrapper);
    }

    @Override
    public void createUser(User user) {
        if (this.existsByAccount(user.getAccount())) {
            throw new BusinessException(5003, "用户名已存在");
        }
        this.submit(user);
    }

    private UserVO toAdminVO(User user, String tenantId) {
        UserVO vo = UserConverter.INSTANCE.convert(user);
        if (StrUtil.isNotBlank(user.getRoleId())) {
            List<String> names = resolveRoleValues(tenantId, user.getRoleId(), false);
            List<String> aliases = resolveRoleValues(tenantId, user.getRoleId(), true);
            vo.setRoleName(String.join(",", names));
            vo.setRoleAlias(String.join(",", aliases));
        }
        return vo;
    }

    private List<String> resolveRoleValues(String tenantId, String roleIds, boolean aliases) {
        if (StrUtil.isBlank(tenantId) || StrUtil.isBlank(roleIds)) {
            return new ArrayList<>();
        }
        String[] ids = Arrays.stream(roleIds.split(","))
                .map(StrUtil::trim)
                .filter(StrUtil::isNotBlank)
                .distinct()
                .toArray(String[]::new);
        if (ids.length == 0) {
            return new ArrayList<>();
        }
        return aliases ? baseMapper.getRoleAlias(tenantId, ids) : baseMapper.getRoleName(tenantId, ids);
    }

    private void syncScopedRoles(List<Long> userIds, List<Long> selectedRoleIds, String scopeId) {
        String scopeType = KnowledgeConstant.ADMIN_TENANT_ID.equals(scopeId) ? "PLATFORM" : "ORGANIZATION";
        userIds.forEach(userId -> {
            com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper<UserRole> removal =
                    userRoleService.lambdaUpdate()
                            .eq(UserRole::getUserId, userId)
                            .eq(UserRole::getScopeType, scopeType)
                            .eq(UserRole::getScopeId, scopeId);
            if (selectedRoleIds.isEmpty()) {
                removal.remove();
            } else {
                removal.notIn(UserRole::getRoleId, selectedRoleIds).remove();
                selectedRoleIds.forEach(roleId -> roleService.grant(userId, roleId));
            }
        });
    }

    private String normalizeAccount(String account) {
        return StrUtil.trim(account).toLowerCase(Locale.ROOT);
    }

    private void assertAccountAvailable(String tenantId, String account, Long excludedUserId) {
        boolean exists = this.lambdaQuery()
                .and(wrapper -> wrapper
                        .eq(User::getNormalizedAccount, normalizeAccount(account))
                        .or()
                        .apply("LOWER(TRIM(account)) = {0}", normalizeAccount(account)))
                .ne(excludedUserId != null, User::getId, excludedUserId)
                .exists();
        if (exists) {
            throw new ServiceException("当前用户已存在!");
        }
    }

    private User requireTenantUser(Long userId, String tenantId) {
        if (userId == null) {
            throw new ServiceException("用户 ID 不能为空");
        }
        User user = this.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .eq(User::getId, userId)
                .one();
        if (user == null) {
            throw new ServiceException("用户不存在或无权操作");
        }
        return user;
    }

    private List<Long> requireAdminTargets(String userIds, boolean allowCurrentUser) {
        List<Long> ids = parseIds(userIds, "用户");
        Long currentUserId = SecurityContextUtil.getUserId();
        if (!allowCurrentUser && currentUserId != null && ids.contains(currentUserId)) {
            throw new ServiceException("不能对当前登录账号执行此操作");
        }
        String tenantId = requireTenantId();
        List<User> users = this.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .in(User::getId, ids)
                .list();
        Set<Long> found = users.stream().map(User::getId).collect(Collectors.toSet());
        if (found.size() != ids.size() || !found.containsAll(ids)) {
            throw new ServiceException("包含不存在或无权操作的用户");
        }
        return ids;
    }

    private String normalizeRoleIds(String tenantId, List<Long> roleIds) {
        if (CollUtil.isEmpty(roleIds)) {
            throw new ServiceException("至少选择一个角色");
        }
        List<Long> ids = roleIds.stream()
                .filter(id -> id != null && id > 0)
                .distinct()
                .collect(Collectors.toList());
        if (ids.isEmpty()) {
            throw new ServiceException("至少选择一个角色");
        }
        List<Role> roles = roleService.lambdaQuery()
                .eq(Role::getTenantId, tenantId)
                .in(Role::getId, ids)
                .orderByAsc(Role::getSort)
                .orderByAsc(Role::getId)
                .list();
        Set<Long> found = roles.stream().map(Role::getId).collect(Collectors.toSet());
        if (found.size() != ids.size() || !found.containsAll(ids)) {
            throw new ServiceException("包含不存在或无权操作的角色");
        }
        return roles.stream().map(role -> String.valueOf(role.getId())).collect(Collectors.joining(","));
    }

    private List<Long> parseIds(String values, String label) {
        if (StrUtil.isBlank(values)) {
            throw new ServiceException(label + " ID 不能为空");
        }
        try {
            LinkedHashSet<Long> ids = Arrays.stream(values.split(","))
                    .map(StrUtil::trim)
                    .filter(StrUtil::isNotBlank)
                    .map(Long::valueOf)
                    .filter(id -> id > 0)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            if (ids.isEmpty()) {
                throw new ServiceException(label + " ID 不能为空");
            }
            return new ArrayList<>(ids);
        } catch (NumberFormatException ex) {
            throw new ServiceException(label + " ID 无效");
        }
    }

    private int normalizeCurrent(Integer current) {
        return current == null || current < 1 ? 1 : current;
    }

    private int normalizeSize(Integer size) {
        if (size == null || size < 1) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }

    private String requireTenantId() {
        String tenantId = SecurityContextUtil.getTenantId();
        if (StrUtil.isBlank(tenantId)) {
            throw new ServiceException("缺少租户信息");
        }
        return tenantId;
    }
}
