package com.knowledge.wiki.service.service.impl;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.FavoriteItem;
import com.knowledge.wiki.service.mapper.FavoriteItemMapper;
import com.knowledge.wiki.service.service.IFavoriteService;

@Service
public class FavoriteItemServiceImpl extends MPJBaseServiceImpl<FavoriteItemMapper, FavoriteItem>
        implements IFavoriteService {

    @Override
    public boolean checkFavorite(Long objectId, Long userId) {
        return this.lambdaQuery()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getObjectId, objectId)
                .exists();
    }

    @Override
    public void remove(Long objectId, Long userId) {
        this.lambdaUpdate()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getObjectId, objectId)
                .remove();
    }

    @Override
    public void create(FavoriteItem favoriteItem) {
        if (!checkFavorite(favoriteItem.getObjectId(), favoriteItem.getUserId())) {
            this.save(favoriteItem);
        }
    }

}
