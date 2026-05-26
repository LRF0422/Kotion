package com.knowledge.system.feign;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.User;
import com.knowledge.system.dto.GrantRolesDTO;
import com.knowledge.system.dto.QueryUserDTO;
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

    @Override
    public R<UserInfo> userInfo(Long userId) {
        User user = userService.userInfo(userId);
        if (user == null) {
            return R.fail("User not found");
        }
        UserVO userVO = UserConverter.INSTANCE.convert(user);
        UserInfo userInfo = new UserInfo();
        userInfo.setUser(userVO);
        return R.data(userInfo);
    }

    @Override
    public R<UserInfo> userInfo(String tenantId, String account, String password) {
        User user = userService.userInfo(tenantId, account, password);
        UserVO userVO = UserConverter.INSTANCE.convert(user);
        UserInfo userInfo = new UserInfo();
        userInfo.setUser(userVO);
        return R.data(userInfo);
    }

    @Override
    public R<IPage<KnowledgeUser>> list(QueryUserDTO dto) {
        IPage<User> userPage = userService.userList(dto);
        return R.data(UserConverter.INSTANCE.convertKnowledgeUserPage(userPage));
    }

    @Override
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

}
