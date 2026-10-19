package com.knowledge.wiki.service.controller;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.DeveloperApplication;
import com.knowledge.wiki.service.entity.dto.DeveloperApplyDTO;
import com.knowledge.wiki.service.entity.vo.DeveloperVO;

/**
 * 开发者认证（开发者本人）。
 *
 * <p>认证是发布 / 管理插件的前置条件；这里只负责提交与查询自己的档案。
 * 审核动作在 {@link AdminDeveloperController}。
 */
@RestController
@RequestMapping("/developer")
public class DeveloperController {

    @Autowired
    private DeveloperApplication developerApplication;

    /** 当前用户的认证档案；从未提交时 data 为 null。 */
    @GetMapping("/me")
    public R<DeveloperVO> me() {
        return R.data(developerApplication.current());
    }

    /** 提交或重新提交认证资料。 */
    @PostMapping("/apply")
    public R<DeveloperVO> apply(@Valid @RequestBody DeveloperApplyDTO dto) {
        return R.data(developerApplication.apply(dto));
    }
}
