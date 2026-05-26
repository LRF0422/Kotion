package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.UserMembership;
import com.knowledge.system.domain.vo.UserMembershipVO;

/**
 * 用户会员关系服务接口
 *
 * @author Qwen
 */
public interface IUserMembershipService extends IService<UserMembership> {

    /**
     * 获取用户的会员信息
     *
     * @param userId 用户ID
     * @return 用户会员信息
     */
    UserMembershipVO getUserMembership(Long userId);

    /**
     * 检查用户是否有Pro会员权限
     *
     * @param userId 用户ID
     * @return 是否有Pro权限
     */
    boolean hasProMembership(Long userId);

    /**
     * 更新用户会员信息
     *
     * @param userId  用户ID
     * @param levelId 会员等级ID
     * @param months  会员时长(月)
     */
    void updateUserMembership(Long userId, Long levelId, Integer months);
}