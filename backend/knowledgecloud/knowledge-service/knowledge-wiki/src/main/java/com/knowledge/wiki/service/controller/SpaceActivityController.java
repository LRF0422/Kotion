package com.knowledge.wiki.service.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.SpaceActivityApplication;
import com.knowledge.wiki.service.entity.dto.SpaceActivityDTO;

/**
 * Space Activity Controller
 * Provides activity feed endpoints for team spaces
 */
@RestController
@RequestMapping("/space/{spaceId}/activity")
public class SpaceActivityController {

    @Autowired
    private SpaceActivityApplication spaceActivityApplication;

    /**
     * Get activity feed for a space
     * GET /knowledge-wiki/space/{spaceId}/activity/list
     *
     * @param spaceId    Space ID
     * @param page       Page number (1-based, default 1)
     * @param pageSize   Page size (default 20)
     * @param actionType Optional filter by action type
     */
    @GetMapping("/list")
    public R<List<SpaceActivityDTO>> listActivities(
            @PathVariable("spaceId") Long spaceId,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize,
            @RequestParam(value = "actionType", required = false) String actionType) {
        return R.data(spaceActivityApplication.getActivities(spaceId, page, pageSize, actionType));
    }

}
