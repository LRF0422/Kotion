import { PMNode as Node } from "@kn/editor";

export const ImageUploader = Node.create({
  name: "image-uploader",
  group: "block",
  addAttributes() {
    return {
      src: {},
      alt: {},
      title: {},
      width: {},
      height: {},
      style: {},
    };
  },
  parseHTML() {
    return [
      {
        tag: "img[src]",
      }
    ]
  }
})