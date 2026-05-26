package com.knowledge.system.event;

import java.util.List;

import com.knowledge.core.message.core.RemoteEvent;
import com.knowledge.system.domain.permission.dto.ResourceDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ResourceScanFinishedEvent extends RemoteEvent {

    private List<ResourceDTO> resources;
    
}
