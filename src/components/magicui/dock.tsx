import React, { createContext, useContext, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "../../utils/cn";

export interface DockContextValue {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  iconSize: number;
  iconMagnification: number;
  iconDistance: number;
  orientation: "horizontal" | "vertical";
  disableMagnification: boolean;
}

const DockContext = createContext<DockContextValue | null>(null);

export function useDock() {
  return useContext(DockContext);
}

export interface DockProps {
  className?: string;
  iconSize?: number;
  iconMagnification?: number;
  disableMagnification?: boolean;
  iconDistance?: number;
  direction?: "top" | "middle" | "bottom" | "left" | "right";
  orientation?: "horizontal" | "vertical";
  children: React.ReactNode;
}

const DEFAULT_SIZE = 40;
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;
const DEFAULT_DISABLEMAGNIFICATION = false;

export const Dock = React.forwardRef<HTMLDivElement, DockProps>(
  (
    {
      className,
      children,
      iconSize = DEFAULT_SIZE,
      iconMagnification = DEFAULT_MAGNIFICATION,
      disableMagnification = DEFAULT_DISABLEMAGNIFICATION,
      iconDistance = DEFAULT_DISTANCE,
      direction = "middle",
      orientation = "horizontal",
      ...props
    },
    ref
  ) => {
    const mouseX = useMotionValue(Infinity);
    const mouseY = useMotionValue(Infinity);

    return (
      <DockContext.Provider
        value={{
          mouseX,
          mouseY,
          iconSize,
          iconMagnification,
          iconDistance,
          orientation,
          disableMagnification,
        }}
      >
        <motion.div
          ref={ref}
          onMouseMove={(e) => {
            if (disableMagnification) return;
            mouseX.set(e.pageX);
            mouseY.set(e.pageY);
          }}
          onMouseLeave={() => {
            mouseX.set(Infinity);
            mouseY.set(Infinity);
          }}
          className={cn(
            "flex select-none",
            orientation === "vertical"
              ? "flex-col w-max h-auto items-center"
              : "flex-row h-max w-max items-center justify-center",
            (direction === "top" || direction === "left") && "items-start",
            direction === "middle" && "items-center",
            (direction === "bottom" || direction === "right") && "items-end",
            className
          )}
          {...props}
        >
          {children}
        </motion.div>
      </DockContext.Provider>
    );
  }
);

Dock.displayName = "Dock";

export interface DockIconProps extends Omit<HTMLMotionProps<"div">, "children"> {
  size?: number;
  magnification?: number;
  distance?: number;
  className?: string;
  children?: React.ReactNode;
}

export const DockIcon = React.forwardRef<HTMLDivElement, DockIconProps>(
  (
    {
      size,
      magnification,
      distance,
      className,
      children,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const localRef = useRef<HTMLDivElement>(null);
    const dockContext = useDock();

    const iconSize = size ?? dockContext?.iconSize ?? DEFAULT_SIZE;
    const iconMagnification = magnification ?? dockContext?.iconMagnification ?? DEFAULT_MAGNIFICATION;
    const iconDistance = distance ?? dockContext?.iconDistance ?? DEFAULT_DISTANCE;
    const orientation = dockContext?.orientation ?? "horizontal";
    const disableMagnification = dockContext?.disableMagnification ?? false;

    const fallbackMouseX = useMotionValue(Infinity);
    const fallbackMouseY = useMotionValue(Infinity);
    const mouseX = dockContext?.mouseX ?? fallbackMouseX;
    const mouseY = dockContext?.mouseY ?? fallbackMouseY;

    const distanceCalc = useTransform(
      orientation === "vertical" ? mouseY : mouseX,
      (val: number) => {
        if (disableMagnification || val === Infinity) return Infinity;
        const bounds = localRef.current?.getBoundingClientRect() ?? { y: 0, height: 0, x: 0, width: 0 };
        if (orientation === "vertical") {
          return val - (bounds.y + bounds.height / 2);
        }
        return val - (bounds.x + bounds.width / 2);
      }
    );

    const sizeTransform = useTransform(
      distanceCalc,
      [-iconDistance, 0, iconDistance],
      [iconSize, iconMagnification, iconSize]
    );

    const springSize = useSpring(sizeTransform, {
      mass: 0.1,
      stiffness: 150,
      damping: 12,
    });

    const displacementTransform = useTransform(
      distanceCalc,
      [-iconDistance, -iconDistance / 2, 0, iconDistance / 2, iconDistance],
      [0, (iconMagnification - iconSize) * 0.4, 0, -(iconMagnification - iconSize) * 0.4, 0]
    );

    const springDisplacement = useSpring(displacementTransform, {
      mass: 0.1,
      stiffness: 150,
      damping: 12,
    });

    return (
      <motion.div
        ref={(el) => {
          localRef.current = el;
          if (typeof forwardedRef === "function") {
            forwardedRef(el);
          } else if (forwardedRef) {
            (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }
        }}
        style={{
          width: disableMagnification ? iconSize : springSize,
          height: disableMagnification ? iconSize : springSize,
          x: orientation === "horizontal" && !disableMagnification ? springDisplacement : undefined,
          y: orientation === "vertical" && !disableMagnification ? springDisplacement : undefined,
          ...style,
        }}
        className={cn(
          "flex aspect-square cursor-pointer items-center justify-center rounded-2xl",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

DockIcon.displayName = "DockIcon";
