import CodeMirror, { ReactCodeMirrorProps } from '@uiw/react-codemirror';
import React from 'react';
import { abcdef } from "@uiw/codemirror-theme-abcdef"
import { useTheme } from '../theme';


interface CodeEditorProps extends ReactCodeMirrorProps {
    className?: string;
}



export const CodeEditor: React.FC<CodeEditorProps> = (props) => {

    const { theme } = useTheme()

    return <CodeMirror
        theme={theme === 'dark' ? abcdef : "light"}
        className={props.className}
        onChange={props.onChange}
        {...props}
    />
}