package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.knowledge.system.domain.vo.DailyCountVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 后台运营统计 Mapper
 *
 * <p>全局维度聚合，忽略租户行拦截器。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface AdminStatsMapper {

	/**
	 * 每日新增注册用户数
	 *
	 * @param startDate 起始日期（含）
	 * @return 按天统计列表
	 */
	@Select("SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS date, COUNT(*) AS value " +
		"FROM knowledge_user " +
		"WHERE is_deleted = 0 AND create_time >= #{startDate} " +
		"GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d') " +
		"ORDER BY date")
	List<DailyCountVO> selectDailyRegistrations(@Param("startDate") String startDate);

	/**
	 * 每日活跃用户数（按接口日志去重统计）
	 *
	 * @param startDate 起始日期（含）
	 * @return 按天统计列表
	 */
	@Select("SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS date, COUNT(DISTINCT create_by) AS value " +
		"FROM knowledge_log_api " +
		"WHERE create_time >= #{startDate} AND create_by IS NOT NULL AND create_by != '' " +
		"GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d') " +
		"ORDER BY date")
	List<DailyCountVO> selectDailyActiveUsers(@Param("startDate") String startDate);

	/**
	 * 用户总数
	 */
	@Select("SELECT COUNT(*) FROM knowledge_user WHERE is_deleted = 0")
	Long selectTotalUsers();
}
