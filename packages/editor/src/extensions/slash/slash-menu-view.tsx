import { Editor } from "@tiptap/core";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import scrollIntoView from "scroll-into-view-if-needed";
import styled from "styled-components";

import { SlashMenuItem } from "./slash";
import { cn } from "@kn/ui";


interface IProps {
  editor: Editor;
  items: SlashMenuItem[];
  command: (command: any) => void;
}

const StyledContainer = styled.div`
  width: 300px;
  max-height: 400px;
  overflow: auto;
`;

const StyledTitle = styled.div`
  padding: 8px 16px;
  font-weight: 500;
`;

const StyledItem = styled.div<{ active: boolean }>`
  display: flex;
  justify-content: space-between;
  padding: 6px;
  cursor: pointer;  

  > div {
    display: flex;
    align-items: center;
  }
`;

const StyledText = styled.div`
  margin-left: 8px;
`;

const StyledSlash = styled.div`
`;

export { StyledItem as SlashItem, StyledText as SlashText, StyledSlash as Slash };

type SlashMenuItemNonDivider = Extract<SlashMenuItem, { text: string }>;

export const SlashMenuView: React.FC<IProps> = forwardRef((props, ref) => {
  const $container = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Memoize selectable items (non-divider items)
  const selectableItems = useMemo(() => {
    return props.items.filter((item): item is SlashMenuItemNonDivider => !("divider" in item));
  }, [props.items]);

  const selectItem = useCallback((index: number) => {
    const command = props.items[index];
    if (command && !("divider" in command)) {
      props.command(command);
    }
  }, [props]);

  const upHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      let newIndex = prev - 1;
      // Skip dividers when moving up
      while (newIndex >= 0 && "divider" in props.items[newIndex]) {
        newIndex--;
      }
      if (newIndex < 0) {
        // Wrap to last selectable item
        newIndex = props.items.length - 1;
        while (newIndex >= 0 && "divider" in props.items[newIndex]) {
          newIndex--;
        }
      }
      return Math.max(0, newIndex);
    });
  }, [props.items]);

  const downHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      let newIndex = prev + 1;
      // Skip dividers when moving down
      while (newIndex < props.items.length && "divider" in props.items[newIndex]) {
        newIndex++;
      }
      if (newIndex >= props.items.length) {
        // Wrap to first selectable item
        newIndex = 0;
        while (newIndex < props.items.length && "divider" in props.items[newIndex]) {
          newIndex++;
        }
      }
      return Math.min(props.items.length - 1, newIndex);
    });
  }, [props.items]);

  const enterHandler = useCallback(() => {
    selectItem(selectedIndex);
  }, [selectedIndex, selectItem]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex((prev) => {
      // If current selection is a divider, find the next selectable item
      if (prev < props.items.length && "divider" in props.items[prev]) {
        for (let i = 0; i < props.items.length; i++) {
          if (!("divider" in props.items[i])) {
            return i;
          }
        }
      }
      return 0;
    });
  }, [props.items]);

  // Scroll selected item into view
  useEffect(() => {
    if (Number.isNaN(selectedIndex + 1)) return;

    const el = $container.current?.querySelector(
      `.slash-menu-item:nth-of-type(${selectedIndex + 1})`
    );

    if (el) {
      scrollIntoView(el, {
        behavior: "smooth",
        scrollMode: "if-needed",
        block: "nearest"
      });
    }
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    }
  }), [upHandler, downHandler, enterHandler]);

  return (
    <StyledContainer
      ref={$container}
      className="p-1 bg-popover text-popover-foreground border shadow-md dark:shadow-lg py-1 rounded-md"
    >
      {props.items.length ? (
        props.items.map((item, index) => {
          if ("divider" in item) {
            return (
              <StyledTitle
                key={`divider-${index}`}
                className="slash-menu-item text-sm border-b mb-2"
              >
                {item.title}
              </StyledTitle>
            );
          }

          if (item.render) {
            return (
              <item.render
                key={`render-${index}`}
                editor={props.editor}
                className="hover:bg-muted/40"
                active={selectedIndex === index}
              />
            );
          }

          return (
            <StyledItem
              key={`item-${index}`}
              className={cn(
                "slash-menu-item hover:bg-muted/50 rounded-sm text-sm transition-colors",
                selectedIndex === index && "bg-muted"
              )}
              active={selectedIndex === index}
              onClick={() => selectItem(index)}
            >
              <div>
                <div className="rounded-sm transition-all duration-200">
                  {item.icon}
                </div>
                <StyledText>{item.text}</StyledText>
              </div>
              <div>
                <StyledSlash className="italic text-sm text-muted-foreground">
                  {item.slash}
                </StyledSlash>
              </div>
            </StyledItem>
          );
        })
      ) : (
        <StyledTitle>未找到指令</StyledTitle>
      )}
    </StyledContainer>
  );
});

SlashMenuView.displayName = "SlashMenuView";
