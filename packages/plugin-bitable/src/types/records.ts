/**
 * Record data type definitions for Bitable.
 */

/** Person information for person-type fields. */
export interface Person {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
}

/** Attachment information for attachment-type fields. */
export interface Attachment {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    uploadTime: string;
}

/** Record data — a single row in the bitable. */
export interface RecordData {
    id: string;
    [key: string]: any;
    /** Tiptap JSON document content for record body/page. */
    content?: any;
    createdTime?: string;
    updatedTime?: string;
    createdBy?: Person;
    updatedBy?: Person;
    /** Manual sort position within a kanban column or table group. */
    order?: number;
}
