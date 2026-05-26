package com.knowledge.system.domain.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class OrganizationDTO implements Serializable {

    private String name;
    private String email;
    private String address;
    
}
