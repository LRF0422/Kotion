package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.system.domain.WatchedItem;
import com.knowledge.system.mapper.WatchedItemMapper;
import com.knowledge.system.service.IWatchedItemService;

@Service
public class WatchedItemServiceImpl extends MPJBaseServiceImpl<WatchedItemMapper, WatchedItem>
                implements IWatchedItemService {

}
