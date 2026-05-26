package com.knowledge.system.service.impl;

import cn.hutool.core.collection.CollUtil;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.system.converter.ResourceConverter;
import com.knowledge.system.domain.permission.Resource;
import com.knowledge.system.mapper.ResourceMapper;
import com.knowledge.system.service.IResourceService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Service
public class ResourceServiceImpl extends MPJBaseServiceImpl<ResourceMapper, Resource> implements IResourceService {
	@Override
	public void saveOrUpdateResource(List<Resource> resources) {
		if (CollUtil.isNotEmpty(resources)) {
			List<Resource> update = new ArrayList<>();
			List<Resource> newResource = new ArrayList<>();
			resources.forEach(resource -> {
				if (resource.getId() == null) {
					if (!checkExists(resource.getName())) {
						newResource.add(resource);
					}
				} else {
					Resource db = this.getById(resource.getId());
					update.add(ResourceConverter.INSTANCE.update(resource, db));
				}
			});
			this.updateBatchById(update);
			this.saveBatch(newResource);
		}
	}

	@Override
	public List<Resource> getByName(List<String> names) {
		return this.lambdaQuery()
				.in(Resource::getName, names)
				.list();
	}

	@Override
	public boolean checkExists(String resourceName) {
		return this.lambdaQuery()
				.eq(Resource::getName, resourceName)
				.exists();
	}

	@Override
	public Resource getAndSaveResource(Resource resource) {
		if (checkExists(resource.getName())) {
			return this.getByName(resource.getName());
		} else {
			this.saveOrUpdateResource(Arrays.asList(resource));
			return resource;
		}
	}

	@Override
	public Resource getByName(String name) {
		return this.lambdaQuery()
				.eq(Resource::getName, name)
				.one();
	}

}
