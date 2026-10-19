package com.knowledge.system.controller;

import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.system.application.DeveloperApplication;
import com.knowledge.system.domain.dto.DeveloperApplyDTO;
import com.knowledge.system.domain.vo.DeveloperVO;
import com.knowledge.system.vo.DeveloperVerificationVO;

import lombok.AllArgsConstructor;

/**
 * 开发者认证（开发者本人）。
 *
 * <p>认证是发布 / 管理插件的前置条件；发布门禁在 knowledge-wiki 侧通过
 * {@code IDeveloperClient} 读取 {@link #verification()}。审核动作见
 * {@link AdminDeveloperController}。
 */
@RestController
@RequestMapping("/developer")
@AllArgsConstructor
public class DeveloperController {

    private final DeveloperApplication developerApplication;

    /** 当前用户的认证档案；从未提交时 data 为 null。 */
    @GetMapping("/me")
    public R<DeveloperVO> me() {
        return R.data(developerApplication.current());
    }

    /** 当前用户的认证状态（服务间契约，knowledge-wiki 发布门禁使用）。 */
    @GetMapping("/verification")
    public R<DeveloperVerificationVO> verification() {
        return R.data(developerApplication.verification());
    }

    /** 提交或重新提交认证资料。 */
    @PostMapping("/apply")
    public R<DeveloperVO> apply(@Valid @RequestBody DeveloperApplyDTO dto) {
        return R.data(developerApplication.apply(dto));
    }
}
