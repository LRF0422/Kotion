import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { Input } from "@kn/ui";
import { Button } from "@kn/ui";
// import { fileOpen } from "browser-fs-access";

interface Props {
  editor: Editor;
  mimeTypes: string[];
  onOK: (arg: string) => void;
}

export const Upload: React.FC<React.PropsWithChildren<Props>> = ({
  editor,
  mimeTypes,
  onOK
}) => {
  const getFile = useCallback(async () => {
    // onOK(url);
  }, [editor, mimeTypes, onOK]);

  return (
    <div>
      <Input />
      <Button onClick={getFile} style={{ marginTop: 12 }}>
        Upload
      </Button>
    </div>
  );
};
