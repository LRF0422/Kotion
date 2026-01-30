import React, { useCallback } from "react";
import { Editor } from "@kn/editor";

import { useActive } from "@kn/editor";
import { Image as ImageExtension } from "../image";
import { Toggle } from "@kn/ui";
import { Image } from "@kn/icon";
import { showFolderDlg } from "../../utils/showFolderDlg";

export const ImageStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isCodeActive = useActive(editor, ImageExtension.name);

  const setImage = useCallback(() => {
    showFolderDlg(editor, (files) => {
      if (files && files.length > 0) {
        const file = files[0];
        // Use file path if available, otherwise use id
        const src = file.path || file.id;
        editor
          .chain()
          .focus()
          .setImage({
            src: src
          })
          .run();
      }
    });
  }, [editor]);

  return (
    <Toggle size="sm" onClick={setImage} pressed={isCodeActive} >
      <Image className="h-4 w-4" />
    </Toggle>
  );
};
