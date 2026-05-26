package com.knowledge.core.permission.core.model;

import lombok.Data;

@Data
public class AbstractResource implements IResource {

    private Long id;
    private String name;
    private String ailas;
    
}
