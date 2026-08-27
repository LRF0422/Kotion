package com.knowledge.system.controller;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.system.application.AdminApplication;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.AdminUserSubmitDTO;
import com.knowledge.system.domain.dto.RegisterDTO;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserVO;

import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;

@RestController
@RequestMapping("/user")
public class UserController {

    @Autowired
    private IUserService userService;
    @Autowired
    private AdminApplication adminApplication;

    /**
     * 公共用户资料查询，页面作者信息等场景仍使用该入口。
     */
    @ApiOperationSupport(order = 1)
    @ApiOperation(value = "查看详情", notes = "传入id")
    @GetMapping("/detail")
    public R<UserVO> detail(User user) {
        User detail = userService.getOne(Condition.getQueryWrapper(user));
        return R.data(UserConverter.INSTANCE.convert(detail));
    }

    @GetMapping("/admin/detail")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    public R<UserVO> adminDetail(@RequestParam("id") Long id) {
        return R.data(userService.adminUserDetail(id));
    }

    @ApiOperationSupport(order = 2)
    @ApiOperation(value = "用户列表", notes = "传入QueryUserDTO")
    @GetMapping("/list")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    public R<IPage<UserVO>> list(QueryUserDTO dto) {
        return R.data(userService.adminUserList(dto));
    }

    @ApiOperationSupport(order = 3)
    @ApiOperation(value = "当前用户信息")
    @GetMapping("/info")
    public R<UserVO> info() {
        User detail = userService.getById(SecurityContextUtil.getUserId());
        return R.data(UserConverter.INSTANCE.convert(detail));
    }

    @PostMapping("/submit")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 4)
    @ApiOperation(value = "新增或修改管理员用户")
    public R<UserVO> submit(@Valid @RequestBody AdminUserSubmitDTO dto) {
        return R.data(userService.submitAdminUser(dto));
    }

    @PostMapping("/update")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 5)
    @ApiOperation(value = "修改管理员用户资料")
    public R<UserVO> update(@Valid @RequestBody AdminUserSubmitDTO dto) {
        if (dto.getId() == null) {
            return R.fail("用户 ID 不能为空");
        }
        return R.data(userService.submitAdminUser(dto));
    }

    @PostMapping("/remove")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 6)
    @ApiOperation(value = "删除用户", notes = "传入用户 ID 集合")
    public R<?> remove(@RequestParam String ids) {
        return R.status(userService.removeAdminUsers(ids));
    }

    @PostMapping("/grant")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 7)
    @ApiOperation(value = "设置角色", notes = "完整替换用户角色")
    public R<?> grant(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds,
            @ApiParam(value = "roleId集合", required = true) @RequestParam String roleIds) {
        return R.status(userService.grantAdminRoles(userIds, roleIds));
    }

    @PostMapping("/reset-password")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 8)
    @ApiOperation(value = "初始化密码", notes = "传入userId集合")
    public R<?> resetPassword(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds) {
        return R.status(userService.resetAdminPasswords(userIds));
    }

    @PostMapping("/enable")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 10)
    @ApiOperation(value = "启用账号", notes = "传入userId集合")
    public R<?> enable(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds) {
        return R.status(userService.setAdminUserStatus(userIds, 1));
    }

    @PostMapping("/disable")
    @PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
    @ApiOperationSupport(order = 11)
    @ApiOperation(value = "禁用账号", notes = "传入userId集合")
    public R<?> disable(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds) {
        return R.status(userService.setAdminUserStatus(userIds, 2));
    }

    @PostMapping("/update-password")
    @ApiOperationSupport(order = 9)
    @ApiOperation(value = "修改密码", notes = "传入密码")
    public R<?> updatePassword(KnowledgeUser user,
            @ApiParam(value = "旧密码", required = true) @RequestParam String oldPassword,
            @ApiParam(value = "新密码", required = true) @RequestParam String newPassword,
            @ApiParam(value = "新密码", required = true) @RequestParam String newPassword1) {
        return R.status(userService.updatePassword(user.getUserId(), oldPassword, newPassword, newPassword1));
    }

    @PostMapping("/register")
    public R<?> register(@RequestBody RegisterDTO dto) {
        adminApplication.register(dto);
        return R.success();
    }
}
