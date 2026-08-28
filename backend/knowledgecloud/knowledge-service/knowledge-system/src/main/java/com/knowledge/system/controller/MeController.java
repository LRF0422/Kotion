package com.knowledge.system.controller;

import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.MePasswordUpdateDTO;
import com.knowledge.system.domain.dto.MeProfileUpdateDTO;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.vo.UserVO;

import lombok.AllArgsConstructor;

@RestController
@AllArgsConstructor
@RequestMapping("/api/v1/me")
public class MeController {

    private final IUserService userService;

    @GetMapping
    public R<UserVO> me() {
        User user = userService.userInfo(currentUserId());
        return R.data(UserConverter.INSTANCE.convert(user));
    }

    @PatchMapping("/profile")
    public R<UserVO> updateProfile(@Valid @RequestBody MeProfileUpdateDTO dto) {
        return R.data(userService.updateCurrentProfile(currentUserId(), dto));
    }

    @PostMapping("/password")
    public R<?> updatePassword(@Valid @RequestBody MePasswordUpdateDTO dto) {
        return R.status(userService.updatePassword(
                currentUserId(),
                dto.getOldPassword(),
                dto.getNewPassword(),
                dto.getConfirmPassword()));
    }

    private Long currentUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw new ServiceException("用户未登录");
        }
        return userId;
    }
}
