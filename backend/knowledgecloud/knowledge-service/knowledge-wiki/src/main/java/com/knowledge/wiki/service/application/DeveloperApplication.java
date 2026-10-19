package com.knowledge.wiki.service.application;

import java.time.LocalDateTime;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.entity.Developer;
import com.knowledge.wiki.service.entity.dto.DeveloperApplyDTO;
import com.knowledge.wiki.service.entity.dto.DeveloperReviewDTO;
import com.knowledge.wiki.service.entity.dto.QueryDeveloperDTO;
import com.knowledge.wiki.service.entity.enums.DeveloperStatus;
import com.knowledge.wiki.service.entity.vo.AdminDeveloperVO;
import com.knowledge.wiki.service.entity.vo.DeveloperVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IDeveloperService;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * 开发者认证。
 *
 * <p>发布 / 管理插件要求认证状态为 {@link DeveloperStatus#APPROVED}。
 * 认证是人工审核：开发者提交资料后进入 PENDING，后台通过后 APPROVED；
 * 驳回（REJECTED）或撤销（SUSPENDED）后开发者可以修改资料重新提交。
 *
 * <p>发布侧门禁由 {@link #requireApproved(Long)} 提供，{@link PluginApplication}
 * 在提交插件、重新提交、发布新版本前调用。
 */
@Service
@Slf4j
public class DeveloperApplication {

    @Autowired
    private IDeveloperService developerService;

    /** 当前用户的认证档案；从未提交时返回 {@code null}。 */
    public DeveloperVO current() {
        return toVO(findByCurrentUser());
    }

    /**
     * 提交 / 重新提交开发者认证。
     *
     * <p>已认证用户不能重复提交；审核中的提交需要等待结果；被驳回或撤销的
     * 记录会沿用原记录更新并重新进入 PENDING。
     */
    @Transactional(rollbackFor = Exception.class)
    public DeveloperVO apply(DeveloperApplyDTO dto) {
        Long userId = currentUserId();
        Developer existing = developerService.getByUserId(userId);
        if (existing != null) {
            if (existing.getStatus() == DeveloperStatus.PENDING) {
                throw WikiException.DEVELOPER_APPLICATION_PENDING.newException();
            }
            if (existing.getStatus() == DeveloperStatus.APPROVED) {
                throw WikiException.DEVELOPER_ALREADY_VERIFIED.newException();
            }
        }

        Developer developer = existing == null ? new Developer() : existing;
        developer.setUserId(userId);
        developer.setUserName(SecurityContextUtil.getUserName());
        developer.setDisplayName(StrUtil.trim(dto.getDisplayName()));
        developer.setContactName(StrUtil.trim(dto.getContactName()));
        developer.setContactEmail(StrUtil.trim(dto.getContactEmail()));
        developer.setContactPhone(StrUtil.trim(dto.getContactPhone()));
        developer.setIdType(dto.getIdType());
        developer.setIdNumber(StrUtil.trim(dto.getIdNumber()));
        developer.setIntro(StrUtil.trim(dto.getIntro()));
        developer.setQualificationPath(StrUtil.trim(dto.getQualificationPath()));
        developer.setStatus(DeveloperStatus.PENDING);
        // A fresh submission starts a fresh review: the previous decision's
        // reason/audit must not leak into the new queue entry.
        developer.setRejectReason(null);
        developer.setReviewComment(null);
        developer.setReviewerId(null);
        developer.setReviewerName(null);
        developer.setReviewTime(null);

        try {
            if (developer.getId() == null) {
                developerService.save(developer);
            } else {
                developerService.updateById(developer);
            }
        } catch (DuplicateKeyException ex) {
            // A concurrent submission won the unique(user_id) race.
            throw WikiException.DEVELOPER_APPLICATION_PENDING.newException(ex);
        }
        log.info("Developer verification submitted by user {}", userId);
        return toVO(developer);
    }

    /**
     * 发布门禁：没有认证或不是 APPROVED 一律拒绝。
     */
    public Developer requireApproved(Long userId) {
        Developer developer = userId == null ? null : developerService.getByUserId(userId);
        if (developer == null || developer.getStatus() != DeveloperStatus.APPROVED) {
            throw WikiException.DEVELOPER_NOT_VERIFIED.newException();
        }
        return developer;
    }

    /**
     * 已认证开发者对外展示的名称；未认证时返回 {@code null}，调用方回退到账号名。
     */
    public String displayNameOf(Long userId) {
        if (userId == null) {
            return null;
        }
        Developer developer = developerService.getByUserId(userId);
        if (developer == null || developer.getStatus() != DeveloperStatus.APPROVED) {
            return null;
        }
        String displayName = StrUtil.trim(developer.getDisplayName());
        return StrUtil.isBlank(displayName) ? null : displayName;
    }

    // ---------------------------------------------------------------- admin

    public IPage<AdminDeveloperVO> adminList(QueryDeveloperDTO dto) {
        requirePermission("platform.plugins.read");
        String keyword = StrUtil.trim(dto.getSearchValue());
        IPage<Developer> page = developerService.page(dto.page(), Wrappers.<Developer>lambdaQuery()
                .eq(dto.getStatus() != null, Developer::getStatus, dto.getStatus())
                .and(StrUtil.isNotBlank(keyword), wrapper -> wrapper
                        .like(Developer::getDisplayName, keyword)
                        .or()
                        .like(Developer::getUserName, keyword)
                        .or()
                        .like(Developer::getContactName, keyword)
                        .or()
                        .like(Developer::getContactEmail, keyword))
                .orderByDesc(Developer::getCreateTime));
        return page.convert(this::toAdminVO);
    }

    /** 后台通过认证：只允许 PENDING → APPROVED。 */
    @Transactional(rollbackFor = Exception.class)
    public AdminDeveloperVO approve(Long id, DeveloperReviewDTO dto) {
        requirePermission("platform.plugins.review");
        Developer developer = require(id);
        if (developer.getStatus() != DeveloperStatus.PENDING) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        boolean updated = developerService.lambdaUpdate()
                .eq(Developer::getId, id)
                .eq(Developer::getStatus, DeveloperStatus.PENDING)
                .set(Developer::getStatus, DeveloperStatus.APPROVED)
                .set(Developer::getRejectReason, null)
                .set(Developer::getReviewComment, StrUtil.trim(dto.getComment()))
                .set(Developer::getReviewerId, currentUserId())
                .set(Developer::getReviewerName, SecurityContextUtil.getUserName())
                .set(Developer::getReviewTime, LocalDateTime.now())
                .update();
        if (!updated) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        log.info("Developer verification {} approved by {}", id, currentUserId());
        return toAdminVO(require(id));
    }

    /** 后台驳回认证：只允许 PENDING → REJECTED，必须给出原因。 */
    @Transactional(rollbackFor = Exception.class)
    public AdminDeveloperVO reject(Long id, DeveloperReviewDTO dto) {
        requirePermission("platform.plugins.review");
        String reason = StrUtil.trim(dto.getReason());
        if (StrUtil.isBlank(reason)) {
            throw WikiException.DEVELOPER_REASON_REQUIRED.newException();
        }
        Developer developer = require(id);
        if (developer.getStatus() != DeveloperStatus.PENDING) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        boolean updated = developerService.lambdaUpdate()
                .eq(Developer::getId, id)
                .eq(Developer::getStatus, DeveloperStatus.PENDING)
                .set(Developer::getStatus, DeveloperStatus.REJECTED)
                .set(Developer::getRejectReason, reason)
                .set(Developer::getReviewComment, StrUtil.trim(dto.getComment()))
                .set(Developer::getReviewerId, currentUserId())
                .set(Developer::getReviewerName, SecurityContextUtil.getUserName())
                .set(Developer::getReviewTime, LocalDateTime.now())
                .update();
        if (!updated) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        log.info("Developer verification {} rejected by {}", id, currentUserId());
        return toAdminVO(require(id));
    }

    /** 撤销已通过的认证：APPROVED → SUSPENDED，必须给出原因。 */
    @Transactional(rollbackFor = Exception.class)
    public AdminDeveloperVO revoke(Long id, DeveloperReviewDTO dto) {
        requirePermission("platform.plugins.review");
        String reason = StrUtil.trim(dto.getReason());
        if (StrUtil.isBlank(reason)) {
            throw WikiException.DEVELOPER_REASON_REQUIRED.newException();
        }
        Developer developer = require(id);
        if (developer.getStatus() != DeveloperStatus.APPROVED) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        boolean updated = developerService.lambdaUpdate()
                .eq(Developer::getId, id)
                .eq(Developer::getStatus, DeveloperStatus.APPROVED)
                .set(Developer::getStatus, DeveloperStatus.SUSPENDED)
                .set(Developer::getRejectReason, reason)
                .set(Developer::getReviewComment, StrUtil.trim(dto.getComment()))
                .set(Developer::getReviewerId, currentUserId())
                .set(Developer::getReviewerName, SecurityContextUtil.getUserName())
                .set(Developer::getReviewTime, LocalDateTime.now())
                .update();
        if (!updated) {
            throw WikiException.DEVELOPER_INVALID_STATE.newException();
        }
        log.info("Developer verification {} revoked by {}", id, currentUserId());
        return toAdminVO(require(id));
    }

    // --------------------------------------------------------------- helper

    private Developer findByCurrentUser() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            return null;
        }
        return developerService.getByUserId(userId);
    }

    private Developer require(Long id) {
        Developer developer = developerService.getById(id);
        if (developer == null) {
            throw WikiException.DEVELOPER_NOT_FOUND.newException();
        }
        return developer;
    }

    private Long currentUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
        return userId;
    }

    /** 与插件后台一致：管理员角色，或显式授予的权限位。 */
    private void requirePermission(String permission) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean allowed = authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream().anyMatch(authority -> {
                    String name = authority.getAuthority();
                    return "ROLE_administrator".equalsIgnoreCase(name)
                            || "ROLE_admin".equalsIgnoreCase(name)
                            || Objects.equals("ROLE_" + permission, name);
                });
        if (!allowed) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
    }

    private DeveloperVO toVO(Developer developer) {
        if (developer == null) {
            return null;
        }
        DeveloperVO vo = new DeveloperVO();
        fill(vo, developer);
        vo.setIdNumberMasked(mask(developer.getIdNumber()));
        return vo;
    }

    private AdminDeveloperVO toAdminVO(Developer developer) {
        AdminDeveloperVO vo = new AdminDeveloperVO();
        fill(vo, developer);
        vo.setIdNumberMasked(mask(developer.getIdNumber()));
        vo.setIdNumber(developer.getIdNumber());
        vo.setReviewComment(developer.getReviewComment());
        vo.setReviewerId(developer.getReviewerId());
        return vo;
    }

    private void fill(DeveloperVO vo, Developer developer) {
        vo.setId(developer.getId());
        vo.setUserId(developer.getUserId());
        vo.setUserName(developer.getUserName());
        vo.setDisplayName(developer.getDisplayName());
        vo.setContactName(developer.getContactName());
        vo.setContactEmail(developer.getContactEmail());
        vo.setContactPhone(developer.getContactPhone());
        vo.setIdType(developer.getIdType());
        vo.setIntro(developer.getIntro());
        vo.setQualificationPath(developer.getQualificationPath());
        vo.setStatus(developer.getStatus());
        vo.setRejectReason(developer.getRejectReason());
        vo.setReviewerName(developer.getReviewerName());
        vo.setReviewTime(developer.getReviewTime());
        vo.setCreateTime(developer.getCreateTime());
        vo.setUpdateTime(developer.getUpdateTime());
    }

    /** 证件号脱敏：保留前 3 位与后 4 位，中间固定 8 个星号。 */
    private String mask(String value) {
        if (StrUtil.isBlank(value)) {
            return null;
        }
        String trimmed = value.trim();
        int length = trimmed.length();
        if (length <= 4) {
            return "****";
        }
        if (length <= 8) {
            return trimmed.substring(0, 1) + "***" + trimmed.substring(length - 2);
        }
        return trimmed.substring(0, 3) + "********" + trimmed.substring(length - 4);
    }
}
