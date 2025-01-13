import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../../hooks/use-active";
// import { uploadImage } from "../../../utilities";
import { Image as ImageExtension } from "../image";
import { Toggle } from "@repo/ui";
import { Image } from "@repo/icon";

export const ImageStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isCodeActive = useActive(editor, ImageExtension.name);

  const setImage = useCallback(() => {
    // uploadImage(editor).then(res => {
    //   editor
    //     .chain()
    //     .focus()
    //     .setImage({
    //       ...res,
    //       src: res.url
    //     })
    //     .run();
    // });
  }, [editor]);

  return (
    <Toggle size="sm" onClick={setImage} pressed={isCodeActive} >
      <Image className="h-4 w-4" />
    </Toggle>
  );
};
