import { SiderMenu } from "../../pages/components/SiderMenu";
import React from "react";

const UserProfile: React.FC = () => {
    return <div>
    </div>
}

export const Setting: React.FC = () => {
    return <div className="flex">
        <div className="flex-none h-[calc(100vh-40px)] bg-muted/40 w-[200px] border-r py-2">
            <UserProfile />
            <SiderMenu size="mini" />
        </div>
        <div className="flex-grow">
            q2123
        </div>
    </div>
}