package com.knowledge.wiki.service.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.PageCommentApplication;
import com.knowledge.wiki.service.entity.dto.CreateCommentDTO;
import com.knowledge.wiki.service.entity.dto.PageCommentDTO;

/**
 * Page Comment Controller
 * Manages page comments, replies, reactions, and resolution
 */
@RestController
@RequestMapping("/space/page/{pageId}/comment")
public class PageCommentController {

    @Autowired
    private PageCommentApplication pageCommentApplication;

    /**
     * Get all comments for a page (with nested replies)
     * GET /knowledge-wiki/space/page/{pageId}/comment/list
     */
    @GetMapping("/list")
    public R<List<PageCommentDTO>> listComments(@PathVariable("pageId") Long pageId) {
        return R.data(pageCommentApplication.getPageComments(pageId));
    }

    /**
     * Add a comment to a page
     * POST /knowledge-wiki/space/page/{pageId}/comment
     */
    @PostMapping
    public R<PageCommentDTO> addComment(@PathVariable("pageId") Long pageId,
            @Valid @RequestBody CreateCommentDTO dto) {
        dto.setPageId(pageId);
        return R.data(pageCommentApplication.addComment(dto));
    }

    /**
     * Delete a comment
     * DELETE /knowledge-wiki/space/page/{pageId}/comment/{commentId}
     */
    @DeleteMapping("/{commentId}")
    public R<?> deleteComment(@PathVariable("pageId") Long pageId,
            @PathVariable("commentId") Long commentId) {
        pageCommentApplication.deleteComment(commentId);
        return R.success();
    }

    /**
     * Toggle resolved status of a comment
     * PUT /knowledge-wiki/space/page/{pageId}/comment/{commentId}/resolve
     */
    @PutMapping("/{commentId}/resolve")
    public R<?> toggleResolved(@PathVariable("pageId") Long pageId,
            @PathVariable("commentId") Long commentId) {
        pageCommentApplication.toggleResolved(commentId);
        return R.success();
    }

    /**
     * Add a reaction to a comment
     * POST /knowledge-wiki/space/page/{pageId}/comment/{commentId}/reaction
     */
    @PostMapping("/{commentId}/reaction")
    public R<?> addReaction(@PathVariable("pageId") Long pageId,
            @PathVariable("commentId") Long commentId,
            @RequestParam("emoji") String emoji) {
        pageCommentApplication.addReaction(commentId, emoji);
        return R.success();
    }

    /**
     * Remove a reaction from a comment
     * DELETE /knowledge-wiki/space/page/{pageId}/comment/{commentId}/reaction
     */
    @DeleteMapping("/{commentId}/reaction")
    public R<?> removeReaction(@PathVariable("pageId") Long pageId,
            @PathVariable("commentId") Long commentId,
            @RequestParam("emoji") String emoji) {
        pageCommentApplication.removeReaction(commentId, emoji);
        return R.success();
    }

    /**
     * Get comment count for a page
     * GET /knowledge-wiki/space/page/{pageId}/comment/count
     */
    @GetMapping("/count")
    public R<Integer> getCommentCount(@PathVariable("pageId") Long pageId) {
        return R.data(pageCommentApplication.getCommentCount(pageId));
    }

}
