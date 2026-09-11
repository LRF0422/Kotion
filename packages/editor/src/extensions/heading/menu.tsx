import type { Level } from '@tiptap/extension-heading';
import React, { useCallback, useMemo } from 'react';
import { Editor } from '@tiptap/core';
import { useTranslation } from '@kn/common';

import { Select } from '../../components';
import { useActive } from '../../hooks/use-active';
import { Heading as HeadingExtension } from './heading';

type HeadingOrParagraph = Level | 'paragraph';

const HEADINGS: Array<{ key: string; value: HeadingOrParagraph }> = [
  { key: 'editor.heading.paragraph', value: 'paragraph' },
  { key: 'editor.heading.h1', value: 1 },
  { key: 'editor.heading.h2', value: 2 },
  { key: 'editor.heading.h3', value: 3 },
  { key: 'editor.heading.h4', value: 4 },
  { key: 'editor.heading.h5', value: 5 },
  { key: 'editor.heading.h6', value: 6 },
];

/** Heading preview sizes — the label keeps the level's scale in the dropdown. */
const PREVIEW_SIZE: Record<Level, string> = {
  1: '1.3em',
  2: '1.1em',
  3: '1.0em',
  4: '0.9em',
  5: '0.8em',
  6: '0.8em',
};

export const HeadingStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  const isH1 = useActive(editor, HeadingExtension.name, { level: 1 });
  const isH2 = useActive(editor, HeadingExtension.name, { level: 2 });
  const isH3 = useActive(editor, HeadingExtension.name, { level: 3 });
  const isH4 = useActive(editor, HeadingExtension.name, { level: 4 });
  const isH5 = useActive(editor, HeadingExtension.name, { level: 5 });
  const isH6 = useActive(editor, HeadingExtension.name, { level: 6 });

  const options = useMemo(
    () =>
      HEADINGS.map(({ key, value }) => ({
        value,
        label:
          value === 'paragraph' ? (
            <span style={{ margin: 0 }}>{t(key)}</span>
          ) : (
            React.createElement(
              `h${value}`,
              { style: { margin: 0, fontSize: PREVIEW_SIZE[value] } },
              t(key),
            )
          ),
      })),
    [t],
  );

  const current = useMemo<HeadingOrParagraph>(() => {
    if (isH1) return 1;
    if (isH2) return 2;
    if (isH3) return 3;
    if (isH4) return 4;
    if (isH5) return 5;
    if (isH6) return 6;
    return 'paragraph';
  }, [isH1, isH2, isH3, isH4, isH5, isH6]);

  const toggle = useCallback(
    (level: HeadingOrParagraph) => {
      if (level === 'paragraph') {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().toggleHeading({ level }).run();
      }
    },
    [editor],
  );

  return (
    <Select
      className='w-[120px] h-7 border-none shadow-none'
      disabled={false}
      editor={editor}
      value={current}
      onChange={toggle}
      options={options}
    ></Select>
  );
};
