interface LogoViewProps {
  className?: string;
  width?: number | string;
}

export function LogoView({ className, width }: LogoViewProps) {
  return (
    <img
      src="/img/musiccloud-banner-very-small.svg"
      alt="musiccloud — share it everywhere"
      className={className}
      style={width !== undefined ? { width } : undefined}
    />
  );
}
