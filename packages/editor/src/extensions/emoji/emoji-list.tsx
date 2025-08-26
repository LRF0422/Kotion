import { CompactEmoji } from "emojibase";
import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useState,
} from "react";

interface EmojiProps {
    items: CompactEmoji[];
    command: ({ id }: { id: any }) => void;
}

export default forwardRef((props: EmojiProps, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        const item = props.items[index];

        if (item) {
            const storedEmojis = localStorage.getItem("emojis");
            if (storedEmojis) {
                const emojis = JSON.parse(storedEmojis) as CompactEmoji[];
                /* Add the item to the emojis. ensure length of emojis doesn't exceed 5. If it exceeds 5, remove the first emoji. */
                //insert the emoji at the beginning of the array
                emojis.unshift(item);
                localStorage.setItem("emojis", JSON.stringify(emojis.slice(0, 5)));
            } else {
                localStorage.setItem("emojis", JSON.stringify([item]));
            }
            props.command({ id: item.unicode });
            // call the command so that it replaces the : with the emoji
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

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === "ArrowLeft") {
                upHandler();
                return true;
            }

            if (event.key === "ArrowRight") {
                downHandler();
                return true;
            }

            if (event.key === "Enter") {
                enterHandler();
                return true;
            }

            return false;
        },
    }));

    if (props.items) {
        return (
            <div className=" bg-popover rounded-md shadow-md p-2 flex flex-row flex-wrap text-2x max-w-sm overflow-hidden">
                {props.items.length ? (
                    props.items.map((item, index) => (
                        <div
                            className={` h-6 w-6 flex items-center justify-center ${index === selectedIndex
                                ? "border rounded-sm"
                                : ""
                                }`}
                            key={index}
                            onClick={() => selectItem(index)}
                        >
                            {item.unicode}
                        </div>
                    ))
                ) : (
                    <div className="item">No result</div>
                )}
            </div>
        );
    }
});