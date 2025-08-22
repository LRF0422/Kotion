import { PMNode as Node, ReactNodeViewRenderer } from "@kn/editor";
import { ImageGalleryView } from "./ImageGalleryView";

export const ImageGallery = Node.create({
  name: "image-gallery",
  group: "block",
  draggable: true,
  addAttributes() {
    return {
      images: {
        default: []
      }
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      HTMLAttributes
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageGalleryView);
  },

  addCommands() {
    return {
      insertGallery:
        () =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name
            })
          }
    }
  },

})