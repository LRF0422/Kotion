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
  width: 320px;
  max-height: 420px;
  overflow: auto;
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.2);
    border-radius: 3px;
    
    &:hover {
      background: hsl(var(--muted-foreground) / 0.3);
    }
  }
`;

const StyledTitle = styled.div`
  padding: 8px 12px 6px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
  margin-top: 4px;
  
  &:first-child {
    margin-top: 0;
  }
`;

const StyledItem = styled.div<{ active: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  margin: 2px 4px;
  cursor: pointer;
  border-radius: 8px;
  gap: 10px;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  > div {
    display: flex;
    align-items: center;
  }
  
  &:hover {
    transform: translateX(2px);
    background: hsl(var(--muted) / 0.4);
  }
  
  ${props => props.active && `
    background: hsl(var(--primary) / 0.12);
    box-shadow: 0 0 0 1.5px hsl(var(--primary) / 0.3) inset;
    transform: translateX(2px);
    
    &:hover {
      background: hsl(var(--primary) / 0.15);
    }
  `}
`;

const StyledIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

const StyledText = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
  line-height: 1.4;
`;

const StyledSlash = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  background: hsl(var(--muted) / 0.5);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid hsl(var(--border) / 0.5);
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
      className="p-2 bg-popover text-popover-foreground border border-border/60 shadow-xl dark:shadow-2xl rounded-xl backdrop-blur-sm"
    >
      {props.items.length ? (
        props.items.map((item, index) => {
          if ("divider" in item) {
            return (
              <StyledTitle
                key={`divider-${index}`}
                className="slash-menu-divider"
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
                className="hover:bg-muted/60 rounded-md mx-1"
                active={selectedIndex === index}
              />
            );
          }

          return (
            <StyledItem
              key={`item-${index}`}
              className={cn(
                "slash-menu-item group"
              )}
              active={selectedIndex === index}
              onClick={() => selectItem(index)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <StyledIconWrapper className={cn(
                  "transition-all duration-200",
                  selectedIndex === index && "bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30"
                )}>
                  {item.icon}
                </StyledIconWrapper>
                <StyledText className={cn(
                  "truncate transition-colors duration-200",
                  selectedIndex === index && "text-primary font-semibold"
                )}>{item.text}</StyledText>
              </div>
              <StyledSlash className={cn(
                selectedIndex === index && "border-primary/40 bg-primary/10 text-primary font-semibold"
              )}>
                {item.slash}
              </StyledSlash>
            </StyledItem>
          );
        })
      ) : (
        <div className="px-4 py-8 text-center">
          <div className="text-muted-foreground text-sm">未找到指令</div>
          <div className="text-muted-foreground/60 text-xs mt-1">请尝试其他关键词</div>
        </div>
      )}
    </StyledContainer>
  );
});

SlashMenuView.displayName = "SlashMenuView";
