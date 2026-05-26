package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.entity.FavoriteItem;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.FavoriteItemDTO;
import com.knowledge.wiki.service.entity.vo.FavoriteItemVO;

@Mapper
public interface FavoriteItemConverter extends IConverter<FavoriteItem, FavoriteItemDTO, FavoriteItemVO> {

    FavoriteItemConverter INSTANCE = Mappers.getMapper(FavoriteItemConverter.class);

    default FavoriteItem convert(Page page) {
        FavoriteItem item = new FavoriteItem();
        item.setName(page.getTitle());
        item.setObjectId(page.getId());
        item.setIcon(page.getIcon());
        item.setScope(page.getSpaceId() + "");
        item.setNickName(SecurityContextUtil.getUserName());
        item.setUserId(SecurityContextUtil.getUserId());
        return item;
    }

    default FavoriteItem convert(Space space) {
        FavoriteItem item = new FavoriteItem();
        item.setName(space.getName());
        item.setObjectId(space.getId());
        item.setIcon(space.getIcon());
        item.setScope(space.getId() + "");
        item.setNickName(SecurityContextUtil.getUserName());
        item.setUserId(SecurityContextUtil.getUserId());
        return item;
    }

}
