package com.knowledge.core.permission.core.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.permission.core.converter.IResourceConverter;
import com.knowledge.core.permission.core.model.IResource;
import com.knowledge.core.permission.feign.IPermissionClient;

import cn.hutool.core.collection.CollUtil;

@Transactional(rollbackFor = Exception.class)
public abstract class AbstractResourceService<Resource extends IResource> implements IResourceService<Resource> {


    @Autowired
    private IPermissionClient permissionClient;

    @Override
    public void saveOrUpdateResource(Resource resource) {
        if (resource.getId() == null) {
            this.save(resource);
        } else {
            Resource db = this.getById(resource.getId());
            getConverter().update(resource, db);
            this.updateById(db);
        }
    }

    @Override
    public void saveOrUpdateResources(List<Resource> resources) {
        if (CollUtil.isNotEmpty(resources)) {
            List<Resource> update = new ArrayList<>();
            List<Resource> save = new ArrayList<>();
            resources.forEach(it -> {
                if (it.getId() == null) {
                    save.add(it);
                } else {
                    Resource db = this.getById(it.getId());
                    getConverter().update(it, db);
                    update.add(db);
                }
            });
            this.saveBatch(save);
            this.updateBatchById(update);
        }
    }

    public abstract IResourceConverter<Resource> getConverter();

}
