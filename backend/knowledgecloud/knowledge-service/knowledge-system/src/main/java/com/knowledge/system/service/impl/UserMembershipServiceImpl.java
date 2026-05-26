package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.MembershipLevel;
import com.knowledge.system.domain.UserMembership;
import com.knowledge.system.domain.vo.UserMembershipVO;
import com.knowledge.system.mapper.UserMembershipMapper;
import com.knowledge.system.service.IMembershipLevelService;
import com.knowledge.system.service.IUserMembershipService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Calendar;
import java.util.Date;

/**
 * 用户会员关系服务实现类
 *
 * @author Qwen
 */
@Service
@RequiredArgsConstructor
public class UserMembershipServiceImpl extends ServiceImpl<UserMembershipMapper, UserMembership>
        implements IUserMembershipService {

    private final IMembershipLevelService membershipLevelService;

    @Override
    public UserMembershipVO getUserMembership(Long userId) {
        LambdaQueryWrapper<UserMembership> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserMembership::getUserId, userId)
                .eq(UserMembership::getIsActive, true)
                .eq(UserMembership::getIsDeleted, 0);

        UserMembership membership = this.getOne(wrapper);

        if (membership == null) {
            // 返回基础会员信息
            UserMembershipVO vo = new UserMembershipVO();
            vo.setUserId(userId);
            vo.setLevelCode("BASIC");
            vo.setLevelName("基础会员");
            vo.setStartTime(new Date());
            // 永久有效：100年后
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.YEAR, 100);
            vo.setEndTime(cal.getTime());
            vo.setIsActive(true);
            vo.setAutoRenew(false);
            vo.setRemainingDays(Integer.MAX_VALUE);
            return vo;
        }

        UserMembershipVO vo = new UserMembershipVO();
        BeanUtils.copyProperties(membership, vo);

        // 获取等级名称
        MembershipLevel level = membershipLevelService.getByLevelCode(membership.getLevelCode());
        if (level != null) {
            vo.setLevelName(level.getLevelName());
        }

        // 计算剩余天数
        Date now = new Date();
        if (membership.getEndTime().after(now)) {
            long diffInMillis = membership.getEndTime().getTime() - now.getTime();
            vo.setRemainingDays((int) (diffInMillis / (1000 * 60 * 60 * 24)));
        } else {
            vo.setRemainingDays(0);
        }

        return vo;
    }

    @Override
    public boolean hasProMembership(Long userId) {
        UserMembershipVO membership = getUserMembership(userId);
        return "PRO".equals(membership.getLevelCode()) &&
                membership.getIsActive() &&
                membership.getEndTime().after(new Date());
    }

    @Override
    public void updateUserMembership(Long userId, Long levelId, Integer months) {
        LambdaQueryWrapper<UserMembership> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserMembership::getUserId, userId)
                .eq(UserMembership::getIsActive, true)
                .eq(UserMembership::getIsDeleted, 0);

        UserMembership membership = this.getOne(wrapper);
        Date now = new Date();
        Date newEndTime;

        if (membership != null) {
            // 续费：在当前到期时间基础上延长
            Calendar cal = Calendar.getInstance();
            if (membership.getEndTime().after(now)) {
                cal.setTime(membership.getEndTime());
            } else {
                cal.setTime(now);
            }
            cal.add(Calendar.MONTH, months);
            newEndTime = cal.getTime();
            membership.setLevelId(levelId);
            membership.setEndTime(newEndTime);
            this.updateById(membership);
        } else {
            // 新购：创建新的会员记录
            membership = new UserMembership();
            membership.setUserId(userId);
            membership.setLevelId(levelId);

            // 获取等级编码
            MembershipLevel level = membershipLevelService.getById(levelId);
            if (level != null) {
                membership.setLevelCode(level.getLevelCode());
            }

            membership.setStartTime(now);
            Calendar cal2 = Calendar.getInstance();
            cal2.setTime(now);
            cal2.add(Calendar.MONTH, months);
            membership.setEndTime(cal2.getTime());
            membership.setIsActive(true);
            membership.setAutoRenew(false);
            membership.setCreateUser(userId);
            membership.setIsDeleted(0);
            this.save(membership);
        }
    }
}