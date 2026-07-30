package com.knowledge.wiki.service.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.SpaceApplication;
import com.knowledge.wiki.service.converter.SpaceConverter;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.enums.SpaceStatus;
import com.knowledge.wiki.service.entity.vo.AdminSpaceDetailVO;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.ISpaceService;

/**
 * 空间后台治理接口（平台管理员使用，不做空间成员权限校验）
 */
@RestController
@RequestMapping("/admin/space")
public class AdminSpaceController {

    @Autowired
    private ISpaceService spaceService;
    @Autowired
    private IPageService pageService;
    @Autowired
    private SpaceApplication spaceApplication;

    /**
     * 空间后台详情（基本信息 + 成员数 + 页面数）
     * GET /knowledge-wiki/admin/space/{id}/detail
     */
    @GetMapping("/{id}/detail")
    public R<AdminSpaceDetailVO> detail(@PathVariable("id") Long id) {
        Space space = spaceService.getById(id);
        if (space == null) {
            return R.fail("空间不存在");
        }
        AdminSpaceDetailVO vo = new AdminSpaceDetailVO();
        vo.setSpace(SpaceConverter.INSTANCE.convertVO(space));
        vo.setMemberCount(spaceApplication.getSpaceMembers(id).size());
        vo.setPageCount(pageService.lambdaQuery()
                .eq(Page::getSpaceId, id)
                .ne(Page::getStatus, PageStatus.DELETED)
                .ne(Page::getStatus, PageStatus.TRASH)
                .count());
        return R.data(vo);
    }

    /**
     * 空间成员列表
     * GET /knowledge-wiki/admin/space/{id}/members
     */
    @GetMapping("/{id}/members")
    public R<List<SpaceMemberDTO>> members(@PathVariable("id") Long id) {
        return R.data(spaceApplication.getSpaceMembers(id));
    }

    /**
     * 归档空间
     * PUT /knowledge-wiki/admin/space/{id}/archive
     */
    @PutMapping("/{id}/archive")
    public R<?> archive(@PathVariable("id") Long id) {
        return R.status(spaceService.lambdaUpdate()
                .eq(Space::getId, id)
                .set(Space::getArchived, true)
                .update());
    }

    /**
     * 恢复归档空间
     * PUT /knowledge-wiki/admin/space/{id}/unarchive
     */
    @PutMapping("/{id}/unarchive")
    public R<?> unarchive(@PathVariable("id") Long id) {
        return R.status(spaceService.lambdaUpdate()
                .eq(Space::getId, id)
                .set(Space::getArchived, false)
                .update());
    }

    /**
     * 启用/停用空间
     * PUT /knowledge-wiki/admin/space/{id}/status?status=ACTIVE|IN_ACTIVE
     */
    @PutMapping("/{id}/status")
    public R<?> updateStatus(@PathVariable("id") Long id,
            @RequestParam("status") SpaceStatus status) {
        return R.status(spaceService.lambdaUpdate()
                .eq(Space::getId, id)
                .set(Space::getStatus, status)
                .update());
    }
}
