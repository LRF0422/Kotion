package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

/**
 * Metadata supplied when saving a page as a template. All fields are optional:
 * when absent, the template keeps the values copied from the source page.
 */
@Data
public class SaveTemplateDTO implements Serializable {

    private String name;
    private String description;
    private List<String> cover;

}
