import { Editor } from "@tiptap/core";

export interface User {
  id: string | number;
  name: string;
  avatar: string;
  [key: string]: unknown;
}

export interface Widget {
  id: string | number;
  url: string;
  name: string;
  icon: string;
  desc: string;
  version?: string;
}

export interface WidgetInfo {
  id: string | number;
  widgetId: string | number;
}

export interface EditorProvider {
  /**
   * 用户信息
   */
  userProvider?: {
    /**
     * 获取当前用户
     */
    getCurrentUser: () => any;

    /**
     * 获取用户列表
     */
    getUsers: (query: string) => Promise<any>;
  };
  /**
   * 文件上传
   */
  fileProvider?: {
    uploadFile: (file: Blob) => Promise<any>;
    getDownloadPath: (path: string) => string;
    download: (path: string) => Promise<any>;
  };
}

export const getEditorProvider = (editor: Editor): EditorProvider => {
  // @ts-ignore
  return editor.options.editorProps.editorProvider;
};
