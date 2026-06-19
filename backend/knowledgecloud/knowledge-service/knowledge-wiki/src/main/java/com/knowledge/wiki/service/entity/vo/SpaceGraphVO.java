package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import lombok.Data;

/**
 * The page relation graph across every space the current user can see.
 * Nodes are pages; edges are page-level references extracted from
 * {@code wiki_link}.
 */
@Data
public class SpaceGraphVO implements Serializable {

    private List<GraphNodeVO> nodes = new ArrayList<>();

    private List<GraphEdgeVO> edges = new ArrayList<>();
}
