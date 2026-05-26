package com.knowledge.wiki.service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.FavoriteApplication;
import com.knowledge.wiki.service.entity.dto.QueryFavoriteDTO;
import com.knowledge.wiki.service.entity.vo.FavoriteItemVO;

@RestController
@RequestMapping("/favorite")
public class FavoriteController {

    @Autowired
    private FavoriteApplication favoriteApplication;

    @DeleteMapping("/{id}")
    public R<?> remove(@PathVariable("id") Long id) {
        favoriteApplication.remove(id);
        return R.success();
    }

    @GetMapping("/list")
    public R<IPage<FavoriteItemVO>> list(QueryFavoriteDTO dto) {
        return R.data(favoriteApplication.list(dto));
    }

}
