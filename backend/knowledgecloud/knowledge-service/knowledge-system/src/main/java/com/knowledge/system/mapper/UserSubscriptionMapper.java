package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.system.domain.UserSubscription;
import com.knowledge.system.domain.vo.AdminUserSubscriptionVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 用户订阅 Mapper。
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface UserSubscriptionMapper extends BaseMapper<UserSubscription> {

	/**
	 * 管理端列表：以用户为主表左连订阅，未订阅用户按免费版呈现。
	 */
	@Select("<script>" +
		"SELECT u.id AS userId, u.account AS account, u.name AS userName, u.avatar AS avatar, " +
		"COALESCE(s.plan_code, 'FREE') AS planCode, " +
		"COALESCE(s.status, 'ACTIVE') AS status, s.end_time AS endTime, s.source AS source " +
		"FROM knowledge_user u " +
		"LEFT JOIN user_subscription s ON s.user_id = u.id AND s.is_deleted = 0 " +
		"WHERE u.is_deleted = 0 " +
		"<if test='keyword != null and keyword.length() > 0'> " +
		"AND (u.account LIKE CONCAT('%', #{keyword}, '%') OR u.name LIKE CONCAT('%', #{keyword}, '%')) " +
		"</if> " +
		"<if test='planCode != null and planCode.length() > 0'> " +
		"AND COALESCE(s.plan_code, 'FREE') = #{planCode} " +
		"</if> " +
		"ORDER BY u.id DESC" +
		"</script>")
	IPage<AdminUserSubscriptionVO> selectAdminUserSubscriptions(IPage<AdminUserSubscriptionVO> page,
		@Param("keyword") String keyword, @Param("planCode") String planCode);
}
