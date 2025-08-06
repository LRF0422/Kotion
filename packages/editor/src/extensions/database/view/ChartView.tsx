import { ChartArea, ChartBar, ChartColumnBig, ChartPie } from "@kn/icon"
import { EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui"
import * as Charts from "./charts"

import {
    Card,
    CardContent,
    CardHeader,
} from "@kn/ui"
import React, { forwardRef, useCallback, useContext } from "react"
import { DropdownMenuContent, DropdownMenuLabel } from "@kn/ui"
import { NodeViewContext } from "../DatabaseView"
import { useToggle } from "ahooks"
import BarChart from "./charts/BarChart"
import AreaChart from "./charts/AreaChart"


const ViewOption = forwardRef((props, ref: any) => {
    return <DropdownMenuContent ref={ref} className="w-[300px]">
        <DropdownMenuLabel>Chart</DropdownMenuLabel>
    </DropdownMenuContent>
})

export const ChartView: React.FC<any> = (props) => {

    const { node, updateAttributes, data, columns, editor, getPos } = useContext(NodeViewContext)
    const config = node.attrs.viewOptions[props.viewKey] || {}
    const [flag, { toggle: t }] = useToggle(false)

    console.log('props', props);


    const renderView = useCallback(() => {
        if (config.type) {
            switch (config.type) {
                case 'Bar Chart':
                    return <BarChart.component {...props} node={node} updateAttributes={updateAttributes} data={data} columns={columns} config={config} t={t} />
                case 'Area Chart':
                    return <AreaChart.component {...props} node={node} updateAttributes={updateAttributes} data={data} columns={columns} config={config} t={t} />
            }
        }
        return <></>
    }, [config, data, columns, node, columns])

    return <div>
        <Card className="">
            <CardHeader className=" border-b p-2">
                <div className="flex items-center gap-2">
                    <Select defaultValue={config.type} onValueChange={(value: string) => {
                        config.type = value
                        const tr = editor.state.tr
                        const currNode = tr.doc.nodeAt(getPos()!)
                        if (currNode) {
                            console.log(currNode);
                            tr.setNodeMarkup(getPos()!, undefined, {
                                ...currNode.attrs,
                                viewOptions: {
                                    ...currNode.attrs.viewOptions,
                                    [props.viewKey]: { ...config }
                                }
                            })
                            editor.view.dispatch(tr)
                            t()
                        }
                    }}>
                        <SelectTrigger className="w-[200px] h-8">
                            <SelectValue placeholder="Select a chart type" />
                        </SelectTrigger>
                        <SelectContent>
                            {
                                Object.values(Charts).map((Chart: any, i) => (
                                    <SelectItem key={i} value={Chart.default.name}>{Chart.default.name}</SelectItem>
                                ))
                            }
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="w-full h-full p-0" >
                {
                    config.type ? renderView() : <EmptyState
                        className="border-none w-full max-w-none rounded-none"
                        title="No chart selected"
                        description="Select a chart to view its contents"
                        action={{
                            label: 'Select a chart',
                            onClick: () => {
                                console.log('123')
                            }
                        }}
                        icons={[ChartBar, ChartPie, ChartArea]}
                    />
                }
            </CardContent>
        </Card>
    </div>
}

// @ts-ignore
ChartView.Option = ViewOption
// @ts-ignore
ChartView.Icon = ChartColumnBig
