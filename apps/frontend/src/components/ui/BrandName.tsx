/**
 * Brand name "musiccloud" with rainbow gradient.
 */

const brandFont: React.CSSProperties = {
  fontFamily: '"Nasalization", sans-serif',
};

export function BrandName() {
  return (
    <span
      style={{
        ...brandFont,
        background:
          "linear-gradient(to right, #FF5247 0%, #9B7BFF 20%, #22D3EE 45%, #34D399 65%, #FBBF24 85%, #FB923C 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      musiccloud
    </span>
  );
}
