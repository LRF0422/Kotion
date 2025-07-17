import { ExtensionWrapper } from "@kn/common";
import { TestExt } from "./test-extension";
import { TestTube } from "@kn/icon";
import React from "react";


export const TestExtension: ExtensionWrapper = {
    name: 'test',
    extendsion: TestExt,
    slashConfig: [
        {
            text: 'test',
            slash: '/test',
            icon: <TestTube />,
            action: () => {

            }
        }
    ]
}