import { motion } from "motion/react"
import { ElementType } from "react"
export const MotionComponent = (component: ElementType) => motion.create(component, { forwardMotionProps: true }) 