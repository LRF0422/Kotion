import React, { useCallback } from "react";
import { Editor } from "@kn/editor";

import { useActive } from "@kn/editor";
import { Image as ImageExtension } from "../image";
import { Toggle } from "@kn/ui";
import { Image } from "@kn/icon";
import { useUploadFile } from "@kn/core";

export const ImageStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isCodeActive = useActive(editor, ImageExtension.name);

  const { upload } = useUploadFile()

  const setImage = useCallback(() => {
    upload().then(res => {
      editor
        .chain()
        .focus()
        .setImage({
          ...res,
          src: res.name
        })
        .run();
    })
  }, [editor]);

  return (
    <Toggle size="sm" onClick={setImage} pressed={isCodeActive} >
      <Image className="h-4 w-4" />
    </Toggle>
  );
};
