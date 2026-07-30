package com.knowledge.wiki.service.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.knowledge.wiki.service.entity.vo.DailyCountVO;
import com.knowledge.wiki.service.entity.vo.TopSpaceVO;

/**
 * 后台运营统计 Mapper（全局维度聚合，忽略租户行拦截器）
 */
@InterceptorIgnore(tenantLine = "true")
public interface AdminWikiStatsMapper {

    /**
     * 每日新建页面数
     */
    @Select("SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS date, COUNT(*) AS value " +
        "FROM wiki_page " +
        "WHERE is_deleted = 0 AND create_time >= #{startDate} " +
        "GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d') " +
        "ORDER BY date")
    List<DailyCountVO> selectDailyNewPages(@Param("startDate") String startDate);

    /**
     * 每日新建空间数
     */
    @Select("SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS date, COUNT(*) AS value " +
        "FROM wiki_space " +
        "WHERE is_deleted = 0 AND create_time >= #{startDate} " +
        "GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d') " +
        "ORDER BY date")
    List<DailyCountVO> selectDailyNewSpaces(@Param("startDate") String startDate);

    /**
     * 按有效页面数排序的 TOP 空间
     */
    @Select("SELECT p.space_id AS spaceId, s.name AS spaceName, s.type AS type, COUNT(*) AS pageCount " +
        "FROM wiki_page p " +
        "INNER JOIN wiki_space s ON s.id = p.space_id AND s.is_deleted = 0 " +
        "WHERE p.is_deleted = 0 AND p.status NOT IN ('TRASH', 'DELETED') " +
        "GROUP BY p.space_id, s.name, s.type " +
        "ORDER BY pageCount DESC " +
        "LIMIT #{limit}")
    List<TopSpaceVO> selectTopSpaces(@Param("limit") Integer limit);

    /**
     * 空间总数
     */
    @Select("SELECT COUNT(*) FROM wiki_space WHERE is_deleted = 0")
    Long selectTotalSpaces();

    /**
     * 有效页面总数（不含回收站/已删除）
     */
    @Select("SELECT COUNT(*) FROM wiki_page WHERE is_deleted = 0 AND status NOT IN ('TRASH', 'DELETED')")
    Long selectTotalPages();
}
