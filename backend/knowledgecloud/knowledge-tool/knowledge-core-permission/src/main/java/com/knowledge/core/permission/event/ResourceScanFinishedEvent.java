package com.knowledge.core.permission.event;

import java.util.List;

import com.knowledge.core.message.core.RemoteEvent;
import com.knowledge.core.permission.feign.dto.ResourceRegisterDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ResourceScanFinishedEvent extends RemoteEvent {
    
    private List<ResourceRegisterDTO> resources;

}
