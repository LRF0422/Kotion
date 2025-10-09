import { Editor } from "@tiptap/core";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
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

export { StyledItem as SlashItem, StyledText as SlashText, StyledSlash as Slash }

export const SlashMenuView: React.FC<IProps> = forwardRef((props, ref) => {
  const $container = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: any) => {
    const command = props.items[index];
    if (command) {
      props.command(command);
    }
  };

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length
    );
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useEffect(() => {
    if (Number.isNaN(selectedIndex + 1)) return;
    const el = $container?.current?.querySelector(
      `.slash-menu-item:nth-of-type(${selectedIndex + 1})`
    );
    el && scrollIntoView(el, { behavior: "smooth", scrollMode: "if-needed" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    // @ts-ignore
    onKeyDown: ({ event }) => {
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
  }));

  return (
    <StyledContainer
      ref={$container} className="p-1 bg-popover text-popover-foreground border shadow-md dark:shadow-lg py-1 rounded-md">
      {props.items.length ? (
        props.items.map((item, index) => {
          return "divider" in item ? (
            <StyledTitle key={index} className="slash-menu-item text-sm border-b mb-2 ">{item.title}</StyledTitle>
          ) : (
            item.render ? <item.render
              editor={props.editor}
              key={index}
              className=" hover:bg-muted/40"
              active={!!(selectedIndex == index)}
            /> : (
              <StyledItem
                key={index}
                className={cn(" slash-menu-item hover:bg-muted/50 rounded-sm text-sm", (selectedIndex === index) && " bg-muted")}
                active={!!(selectedIndex == index)}
                onClick={() => selectItem(index)}>
                <div>
                  <div className="rounded-sm slash-menu-item transition-all duration-200">
                    {item.icon}
                  </div>
                  <StyledText>{item.text}</StyledText>
                </div>
                <div>
                  <StyledSlash className=" italic text-sm text-popover-foreground">{item.slash}</StyledSlash>
                </div>
              </StyledItem>
            )
          );
        })
      ) : (
        <StyledTitle>未找到指令</StyledTitle>
      )}
    </StyledContainer>
  );
});

SlashMenuView.displayName = "SlashMenuView";
