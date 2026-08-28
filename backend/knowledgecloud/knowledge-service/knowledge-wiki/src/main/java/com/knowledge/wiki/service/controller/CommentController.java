package com.knowledge.wiki.service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.wiki.service.application.PageCommentApplication;
import com.knowledge.wiki.service.entity.dto.PageCommentDTO;
import com.knowledge.wiki.service.entity.dto.QueryCommentDTO;

/**
 * Global Comment Controller (admin moderation)
 * Paged comment list across all pages
 */
@RestController
@RequestMapping("/comment")
@PreAuthorize("(hasRole('platform.content.comments.read') or " + RoleConstant.HAS_ROLE_ADMIN
        + ") and principal.clientId == 'kotion-platform-admin'")
public class CommentController {

    @Autowired
    private PageCommentApplication pageCommentApplication;

    /**
     * Paged global comment list
     * GET /knowledge-wiki/comment/list
     */
    @GetMapping("/list")
    public R<IPage<PageCommentDTO>> list(QueryCommentDTO dto) {
        return R.data(pageCommentApplication.pageComments(dto));
    }

    /**
     * Delete a comment
     * DELETE /knowledge-wiki/comment/{commentId}
     */
    @PreAuthorize("(hasRole('platform.content.comments.moderate') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    @DeleteMapping("/{commentId}")
    public R<?> delete(@PathVariable("commentId") Long commentId) {
        pageCommentApplication.deleteComment(commentId);
        return R.success();
    }

    /**
     * Toggle resolved status of a comment
     * PUT /knowledge-wiki/comment/{commentId}/resolve
     */
    @PreAuthorize("(hasRole('platform.content.comments.moderate') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    @PutMapping("/{commentId}/resolve")
    public R<?> toggleResolved(@PathVariable("commentId") Long commentId) {
        pageCommentApplication.toggleResolved(commentId);
        return R.success();
    }

}
