package com.knowledge.wiki.service.converter;

import java.util.ArrayList;
import java.util.List;

import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.WikiBlock;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.entity.vo.WikiBlockVO;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;

/** Converts authoritative block rows into API views without legacy entities. */
public final class WikiBlockViewConverter {

    private WikiBlockViewConverter() {
    }

    public static WikiBlockVO toListVO(WikiBlock block, Page page, Space space) {
        if (block == null) {
            return null;
        }
        JSONObject node = parseNode(block);
        WikiBlockVO vo = new WikiBlockVO();
        vo.setId(block.getBlockId());
        vo.setType(block.getType());
        vo.setText(block.getText());
        vo.setParentId(block.getParentId());
        vo.setPageId(block.getPageId());
        vo.setBlockRank(block.getBlockRank());
        vo.setRev(block.getRev());
        applyNode(node, vo);
        decorate(page, space, vo);
        return vo;
    }

    public static PageBlockVO toLightVO(WikiBlock block, Page page, Space space) {
        if (block == null) {
            return null;
        }
        JSONObject node = parseNode(block);
        PageBlockVO vo = new PageBlockVO();
        vo.setId(block.getBlockId());
        vo.setPageId(block.getPageId());
        vo.setType(block.getType());
        vo.setContent(objects(node == null ? null : node.getJSONArray("content")));
        if (page != null) {
            vo.setSpaceId(page.getSpaceId());
            vo.setPageTitle(page.getTitle());
        }
        if (space != null) {
            vo.setSpaceName(space.getName());
        }
        return vo;
    }

    public static PageBlockDetailVO toDetailVO(WikiBlock block, Page page, Space space) {
        if (block == null) {
            return null;
        }
        JSONObject node = parseNode(block);
        PageBlockDetailVO vo = detailNode(node, block.getParentId());
        vo.setId(block.getBlockId());
        vo.setType(block.getType());
        vo.setText(block.getText());
        decorateDetail(vo, block.getPageId(), page, space);
        return vo;
    }

    private static void applyNode(JSONObject node, WikiBlockVO vo) {
        if (node == null) {
            return;
        }
        vo.setAttrs(node.getJSONObject("attrs"));
        vo.setContent(objects(node.getJSONArray("content")));
        vo.setMarks(objects(node.getJSONArray("marks")));
    }

    private static void decorate(Page page, Space space, WikiBlockVO vo) {
        if (page != null) {
            vo.setSpaceId(page.getSpaceId());
            vo.setPageTitle(page.getTitle());
        }
        if (space != null) {
            vo.setSpaceName(space.getName());
        }
    }

    private static PageBlockDetailVO detailNode(JSONObject node, String parentId) {
        PageBlockDetailVO vo = new PageBlockDetailVO();
        if (node == null) {
            return vo;
        }
        vo.setContent(node);
        vo.setType(node.getStr("type"));
        vo.setText(node.getStr("text"));
        vo.setAttrs(node.getJSONObject("attrs"));
        vo.setMarks(objects(node.getJSONArray("marks")));
        vo.setParentId(parentId);
        String nodeId = vo.getAttrs() == null ? null : vo.getAttrs().getStr("id");
        vo.setId(nodeId);

        JSONArray content = node.getJSONArray("content");
        if (CollUtil.isNotEmpty(content)) {
            List<PageBlockDetailVO> children = new ArrayList<>(content.size());
            for (Object item : content) {
                JSONObject child = asObject(item);
                if (child != null) {
                    children.add(detailNode(child, nodeId));
                }
            }
            vo.setChildren(children);
        }
        return vo;
    }

    private static void decorateDetail(PageBlockDetailVO vo, Long pageId, Page page, Space space) {
        vo.setPageId(pageId);
        vo.setFullPath(pageId + "/" + (vo.getId() == null ? "" : vo.getId()));
        if (page != null) {
            vo.setPageTitle(page.getTitle());
            vo.setSpaceId(page.getSpaceId());
            vo.setCreateTime(page.getCreateTime());
            vo.setUpdateTime(page.getUpdateTime());
            vo.setCreateUser(page.getCreateUser());
            vo.setUpdateUser(page.getUpdateUser());
        }
        if (space != null) {
            vo.setSpaceName(space.getName());
        }
        if (CollUtil.isNotEmpty(vo.getChildren())) {
            for (PageBlockDetailVO child : vo.getChildren()) {
                decorateDetail(child, pageId, page, space);
            }
        }
    }

    private static JSONObject parseNode(WikiBlock block) {
        if (block == null || StrUtil.isBlank(block.getNode())) {
            return null;
        }
        try {
            return JSONUtil.parseObj(block.getNode());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static List<JSONObject> objects(JSONArray array) {
        if (CollUtil.isEmpty(array)) {
            return null;
        }
        List<JSONObject> result = new ArrayList<>(array.size());
        for (Object item : array) {
            JSONObject object = asObject(item);
            if (object != null) {
                result.add(object);
            }
        }
        return result;
    }

    private static JSONObject asObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof JSONObject) {
            return (JSONObject) value;
        }
        try {
            return JSONUtil.parseObj(value);
        } catch (Exception ignored) {
            return null;
        }
    }
}
