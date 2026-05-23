import React from "react";

type AuraLogoProps = React.ImgHTMLAttributes<HTMLImageElement> & { state?: string };

export function AuraLogo({ state = "idle", className = "", alt = "Aura", ...props }: AuraLogoProps) {
  return (
    <img
      {...props}
      alt={alt}
      src="/aura-logo.png"
      className={`${className} aura-logo aura-${state} transition-all duration-500`}
      draggable={false}
    />
  );
}
