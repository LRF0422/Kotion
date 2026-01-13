import CodeMirror, { ReactCodeMirrorProps, EditorView } from '@uiw/react-codemirror';
import React from 'react';
import { abcdef } from "@uiw/codemirror-theme-abcdef"
import { useTheme } from '../theme';
import { update } from 'lodash';


interface CodeEditorProps extends ReactCodeMirrorProps {
    className?: string;
}



export const CodeEditor: React.FC<CodeEditorProps> = (props) => {

    const { theme } = useTheme()

    return <CodeMirror
        theme={theme === 'dark' ? abcdef : "light"}
        className={props.className}
        onUpdate={() => {
            // CodeMirror update handler
        }}
        onChange={props.onChange}
        {...props}
    />
}