package com.knowledge.core.permission.core.converter;

import org.mapstruct.MappingTarget;

import com.knowledge.core.permission.core.model.IResource;

public interface IResourceConverter<Resource extends IResource> {

    void update(Resource source, @MappingTarget Resource target);

}
