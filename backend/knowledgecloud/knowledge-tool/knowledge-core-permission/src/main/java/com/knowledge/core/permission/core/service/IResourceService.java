package com.knowledge.core.permission.core.service;

import java.io.Serializable;
import java.util.List;

import com.knowledge.core.permission.core.model.IResource;

public interface IResourceService<Resource extends IResource> {

    void saveOrUpdateResource(Resource resource);

    void saveOrUpdateResources(List<Resource> resources);

    Resource getById(Serializable id);

    void updateById(Resource resource);

    void save(Resource resource);

    void updateBatchById(List<Resource> resources);

    void saveBatch(List<Resource> resources);

}
