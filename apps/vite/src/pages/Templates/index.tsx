import { Template } from "../../model/Template";
import React, { useState } from "react";

export const TemplateHub: React.FC = () => {

    const [templates, setTemplates] = useState<Template[]>([])

    return <div>Templates</div>
}