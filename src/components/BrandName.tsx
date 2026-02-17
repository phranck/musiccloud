/**
 * Brand name "music cloud" with bold "cloud".
 */

const brandFont: React.CSSProperties = {
  fontFamily: '"Nasalization", sans-serif',
};

export function BrandName() {
  return (
    <span
      style={{
        ...brandFont,
        background: "linear-gradient(to right, #FF5247 0%, #9B7BFF 20%, #22D3EE 45%, #34D399 65%, #FBBF24 85%, #FB923C 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      <span style={{ WebkitTextStroke: "1px rgba(255,255,255,0.3)" }}>music</span>
      <span style={{ WebkitTextStroke: "1px rgba(255,255,255,0.3)" }}>cloud</span>
    </span>
  );
}
