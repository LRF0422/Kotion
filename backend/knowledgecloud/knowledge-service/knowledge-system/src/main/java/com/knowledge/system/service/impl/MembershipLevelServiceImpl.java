package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.MembershipLevel;
import com.knowledge.system.domain.vo.MembershipLevelVO;
import com.knowledge.system.mapper.MembershipLevelMapper;
import com.knowledge.system.service.IMembershipLevelService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 会员等级服务实现类
 *
 * @author Qwen
 */
@Service
@RequiredArgsConstructor
public class MembershipLevelServiceImpl extends ServiceImpl<MembershipLevelMapper, MembershipLevel>
        implements IMembershipLevelService {

    @Override
    public List<MembershipLevelVO> getAllEnabledLevels() {
        LambdaQueryWrapper<MembershipLevel> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(MembershipLevel::getStatus, 1)
                .eq(MembershipLevel::getIsDeleted, 0)
                .orderByAsc(MembershipLevel::getSort);

        List<MembershipLevel> levels = this.list(wrapper);

        return levels.stream().map(level -> {
            MembershipLevelVO vo = new MembershipLevelVO();
            BeanUtils.copyProperties(level, vo);
            // 解析权益JSON
            if (Func.isNotEmpty(level.getBenefits())) {
                vo.setBenefits(Func.toStrList(level.getBenefits()));
            }
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public MembershipLevel getByLevelCode(String levelCode) {
        LambdaQueryWrapper<MembershipLevel> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(MembershipLevel::getLevelCode, levelCode)
                .eq(MembershipLevel::getStatus, 1)
                .eq(MembershipLevel::getIsDeleted, 0);

        return this.getOne(wrapper);
    }
}