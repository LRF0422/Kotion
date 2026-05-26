package com.knowledge.wiki.service.application;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.converter.FavoriteItemConverter;
import com.knowledge.wiki.service.entity.FavoriteItem;
import com.knowledge.wiki.service.entity.dto.QueryFavoriteDTO;
import com.knowledge.wiki.service.entity.vo.FavoriteItemVO;
import com.knowledge.wiki.service.service.IFavoriteService;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class FavoriteApplication {

    @Autowired
    private IFavoriteService favoriteService;

    public void remove(Long objectId) {
        favoriteService.remove(objectId, SecurityContextUtil.getUserId());
    }

    public IPage<FavoriteItemVO> list(QueryFavoriteDTO dto) {
        return FavoriteItemConverter.INSTANCE.convertVO(
                this.favoriteService.lambdaQuery()
                        .eq(FavoriteItem::getUserId, SecurityContextUtil.getUserId())
                        .eq(StrUtil.isNotEmpty(dto.getScope()), FavoriteItem::getScope, dto.getScope())
                        .page(dto.page()));
    }

}
