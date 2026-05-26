package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.Collaborator;
import com.knowledge.wiki.service.mapper.CollaboratorMapper;
import com.knowledge.wiki.service.service.ICollaboratorService;

@Service
public class CollaboratorServiceImpl extends MPJBaseServiceImpl<CollaboratorMapper, Collaborator>
        implements ICollaboratorService {

}
