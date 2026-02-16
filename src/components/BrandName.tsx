/**
 * Brand name "music cloud" with bold "cloud".
 */

const brandFont: React.CSSProperties = {
  fontFamily: '"Nasalization", sans-serif',
};

export function BrandName() {
  return (
    <span style={brandFont}>
      <span style={{ opacity: 0.7 }}>music</span>
      <span style={{ WebkitTextStroke: "1px currentColor" }}>cloud</span>
    </span>
  );
}
