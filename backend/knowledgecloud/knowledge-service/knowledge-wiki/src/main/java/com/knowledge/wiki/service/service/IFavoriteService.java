package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.FavoriteItem;

public interface IFavoriteService extends MPJBaseService<FavoriteItem> {

    boolean checkFavorite(Long objectId, Long userId);

    void remove(Long object, Long userId);

    void create(FavoriteItem favoriteItem);

}
