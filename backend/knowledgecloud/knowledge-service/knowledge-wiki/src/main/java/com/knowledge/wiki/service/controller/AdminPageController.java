package com.knowledge.wiki.service.controller;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.wiki.service.converter.PageConverter;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.QueryAdminPageDTO;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.service.IPageService;

import cn.hutool.core.util.StrUtil;

/**
 * 页面后台治理接口（平台管理员使用）
 */
@RestController
@RequestMapping("/admin/page")
@PreAuthorize("(hasRole('platform.content.pages.read') or " + RoleConstant.HAS_ROLE_ADMIN
        + ") and principal.clientId == 'kotion-platform-admin'")
public class AdminPageController {

    private static final DateTimeFormatter DAY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private IPageService pageService;

    /**
     * 页面列表（支持状态/空间/创建人/时间范围筛选）
     * GET /knowledge-wiki/admin/page/list
     */
    @GetMapping("/list")
    public R<IPage<PageVO>> list(QueryAdminPageDTO dto) {
        return withTenantBypass(() -> {
        IPage<PageVO> page = PageConverter.INSTANCE.convertVO(
                pageService.lambdaQuery()
                        .eq(dto.getSpaceId() != null, Page::getSpaceId, dto.getSpaceId())
                        .eq(dto.getStatus() != null, Page::getStatus, dto.getStatus())
                        .ne(dto.getStatus() == null, Page::getStatus, PageStatus.DELETED)
                        .eq(dto.getCreateUser() != null, Page::getCreateUser, dto.getCreateUser())
                        .ge(StrUtil.isNotBlank(dto.getStartTime()), Page::getCreateTime,
                                parseDay(dto.getStartTime(), true))
                        .le(StrUtil.isNotBlank(dto.getEndTime()), Page::getCreateTime,
                                parseDay(dto.getEndTime(), false))
                        .like(StrUtil.isNotBlank(dto.getSearchValue()), Page::getTitle, dto.getSearchValue())
                        .orderByDesc(Page::getCreateTime)
                        .page(dto.page()));
        page.getRecords().forEach(item -> {
            item.setContent(null);
            item.setParents(null);
            item.setBacklinks(null);
        });
        return R.data(page);
        });
    }

    /**
     * 批量恢复回收站页面
     * POST /knowledge-wiki/admin/page/batch-restore?ids=1,2,3
     */
    @PreAuthorize("(hasRole('platform.content.pages.moderate') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    @PostMapping("/batch-restore")
    public R<?> batchRestore(@RequestParam("ids") String ids) {
        List<Long> idList = Func.toLongList(ids);
        if (idList.isEmpty()) {
            return R.fail("请选择要恢复的页面");
        }
        return withTenantBypass(() -> R.status(pageService.lambdaUpdate()
                .in(Page::getId, idList)
                .eq(Page::getStatus, PageStatus.TRASH)
                .set(Page::getStatus, PageStatus.ACTIVE)
                .update()));
    }

    /**
     * 批量彻底删除（仅允许删除回收站中的页面）
     * DELETE /knowledge-wiki/admin/page/batch?ids=1,2,3
     */
    @PreAuthorize("(hasRole('platform.content.pages.moderate') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    @DeleteMapping("/batch")
    public R<?> batchDelete(@RequestParam("ids") String ids) {
        List<Long> idList = Func.toLongList(ids);
        if (idList.isEmpty()) {
            return R.fail("请选择要删除的页面");
        }
        return withTenantBypass(() -> R.status(pageService.lambdaUpdate()
                .in(Page::getId, idList)
                .eq(Page::getStatus, PageStatus.TRASH)
                .set(Page::getStatus, PageStatus.DELETED)
                .update()));
    }

    private <T> T withTenantBypass(Supplier<T> action) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            return action.get();
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    private java.time.LocalDateTime parseDay(String day, boolean startOfDay) {
        if (StrUtil.isBlank(day)) {
            return null;
        }
        LocalDate date = LocalDate.parse(day, DAY_FORMATTER);
        return startOfDay ? date.atStartOfDay() : date.atTime(LocalTime.MAX);
    }
}
