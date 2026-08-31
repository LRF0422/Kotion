import type { SpacePageTemplate } from "@kn/common";
import React, { useState } from "react";

export const TemplateHub: React.FC = () => {

    const [templates, setTemplates] = useState<SpacePageTemplate[]>([])

    return <div>Templates</div>
}