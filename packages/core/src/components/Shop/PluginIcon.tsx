import { cn } from "@kn/ui";
import React, { useEffect, useState } from "react";

interface PluginIconProps {
  src?: string;
  name?: string;
  className?: string;
  imageClassName?: string;
  loading?: "eager" | "lazy";
}

export const PluginIcon: React.FC<PluginIconProps> = ({
  src,
  name,
  className,
  imageClassName,
  loading = "lazy",
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  const initials = name?.trim().slice(0, 2).toUpperCase() || "?";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/60",
        className,
      )}
      aria-hidden={!name}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name ?? ""}
          className={cn("size-full object-cover", imageClassName)}
          loading={loading}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="select-none text-sm font-semibold text-muted-foreground">
          {initials}
        </span>
      )}
    </div>
  );
};
