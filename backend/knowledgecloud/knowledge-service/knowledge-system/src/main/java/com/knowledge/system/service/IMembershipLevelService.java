package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.MembershipLevel;
import com.knowledge.system.domain.vo.MembershipLevelVO;

import java.util.List;

/**
 * 会员等级服务接口
 *
 * @author Qwen
 */
public interface IMembershipLevelService extends IService<MembershipLevel> {

    /**
     * 获取所有启用的会员等级
     *
     * @return 会员等级列表
     */
    List<MembershipLevelVO> getAllEnabledLevels();

    /**
     * 根据编码获取会员等级
     *
     * @param levelCode 等级编码
     * @return 会员等级
     */
    MembershipLevel getByLevelCode(String levelCode);
}