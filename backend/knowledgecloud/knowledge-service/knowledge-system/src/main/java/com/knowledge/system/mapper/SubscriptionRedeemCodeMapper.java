package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.SubscriptionRedeemCode;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/**
 * 兑换码 Mapper。
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface SubscriptionRedeemCodeMapper extends BaseMapper<SubscriptionRedeemCode> {

	/** 原子占用一次：并发兑换也只有一次能成功。 */
	@InterceptorIgnore(tenantLine = "true")
	@Update("UPDATE subscription_redeem_code SET used_count = used_count + 1, update_time = NOW() "
			+ "WHERE id = #{id} AND status = 1 AND used_count < max_uses "
			+ "AND (expires_at IS NULL OR expires_at > NOW())")
	int consume(@Param("id") Long id);
}
