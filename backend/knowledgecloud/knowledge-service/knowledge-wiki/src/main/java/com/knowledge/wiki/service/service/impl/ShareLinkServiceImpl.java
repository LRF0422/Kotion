package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.ShareLink;
import com.knowledge.wiki.service.mapper.ShareLinkMapper;
import com.knowledge.wiki.service.service.IShareLinkService;

@Service
public class ShareLinkServiceImpl extends MPJBaseServiceImpl<ShareLinkMapper, ShareLink>
        implements IShareLinkService {

}