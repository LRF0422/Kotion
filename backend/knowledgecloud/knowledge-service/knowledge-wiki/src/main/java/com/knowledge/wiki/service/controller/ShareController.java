package com.knowledge.wiki.service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.SpaceApplication;
import com.knowledge.wiki.service.entity.vo.SharedPageVO;

/**
 * Public share link endpoints.
 * The /share/public/** path is excluded from authentication so anonymous
 * visitors can open shared pages via short code.
 */
@RestController
@RequestMapping("/share")
public class ShareController {

    @Autowired
    private SpaceApplication spaceApplication;

    /**
     * Resolve a share link into read-only page content
     * GET /knowledge-wiki/share/public/{shortCode}/resolve
     */
    @GetMapping("/public/{shortCode}/resolve")
    public R<SharedPageVO> resolve(@PathVariable("shortCode") String shortCode) {
        return R.data(spaceApplication.resolveShareLink(shortCode));
    }
}
