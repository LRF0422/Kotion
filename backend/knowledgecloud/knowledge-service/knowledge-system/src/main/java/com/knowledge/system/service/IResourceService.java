package com.knowledge.system.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.system.domain.permission.Resource;

import java.util.List;

public interface IResourceService extends MPJBaseService<Resource> {

	void saveOrUpdateResource(List<Resource> resources);

	Resource getAndSaveResource(Resource resource);

	List<Resource> getByName(List<String> names);

	Resource getByName(String name);

	boolean checkExists(String resourceName);


}
