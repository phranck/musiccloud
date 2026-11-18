/**
 * @file The GiroCode of the transfer card, drawn by `qr-code-styling`.
 */

import type { SupportLadderQrStyle } from "@musiccloud/shared";
import { useEffect, useState } from "react";

import { SMALL_CORNER_RADIUS } from "@/components/cards/groupedCorners";

/**
 * How the GiroCode looks where the page names nothing.
 *
 * - `Size`: edge of the code in pixels, 176.
 * - `Margin`: quiet zone in pixels, 8. The format asks for one, and the box paints it.
 * - `Color`: the dots, near black, for the contrast a scanner needs.
 * - `Background`: the quiet zone, white.
 * - `Dots`: the shape of the dots, `rounded`.
 * - `Corners`: the shape of the three corner marks, `extra-rounded`.
 */
const GiroCodeDefault = {
  Size: 176,
  Margin: 8,
  Color: "#1c1c1e",
  Background: "#ffffff",
  Dots: "rounded",
  Corners: "extra-rounded",
} as const;

/** The format the renderer writes, which an `img` shows as it is. */
const RENDER_FORMAT = "svg";

/** The QR renderer's module, once something has asked for it. */
let qrRenderer: Promise<typeof import("qr-code-styling")> | null = null;

/**
 * Loads the QR renderer, once for the whole page.
 *
 * Every code drawn waits on the same request, so a reader who changes the
 * amount before the renderer has arrived still gets the code for the amount
 * they chose.
 *
 * @returns The renderer's module.
 */
function loadQrRenderer(): Promise<typeof import("qr-code-styling")> {
  qrRenderer ??= import("qr-code-styling");
  return qrRenderer;
}

/**
 * The code drawn for one payload.
 *
 * @property payload - What it encodes.
 * @property src - The drawing, as a `data:image/svg+xml` address.
 */
interface Drawing {
  payload: string;
  src: string;
}

/** Props of {@link GiroCode}. */
interface GiroCodeProps {
  /** The EPC payload to encode. */
  payload: string;
  /** How the code looks, as the page named it; anything it leaves out takes {@link GiroCodeDefault}. */
  style: SupportLadderQrStyle | undefined;
  /** The code's text alternative. */
  label: string;
}

/**
 * The GiroCode, as an image.
 *
 * The renderer is loaded when a code is first drawn, so a page without a ladder
 * never fetches it. It writes an SVG, which the box shows as an `img` with the
 * label as its alternative. The renderer embeds a center picture in the SVG, so
 * the image needs nothing beyond itself. The box paints the quiet zone, so the
 * code keeps the contrast a scanner needs on the site's dark cards.
 *
 * A drawing is shown only while it encodes the payload in hand. Between a new
 * amount and its drawing the box stays empty rather than offering a code for
 * the old amount.
 *
 * @param props - See {@link GiroCodeProps}.
 * @returns The box with the code in it.
 */
export function GiroCode({ payload, style, label }: GiroCodeProps) {
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const size = style?.size ?? GiroCodeDefault.Size;
  const margin = style?.margin ?? GiroCodeDefault.Margin;
  const color = style?.color ?? GiroCodeDefault.Color;
  const dots = style?.dots ?? GiroCodeDefault.Dots;
  const corners = style?.corners ?? GiroCodeDefault.Corners;
  const image = style?.image;

  useEffect(() => {
    let cancelled = false;
    void loadQrRenderer()
      .then(({ default: QRCodeStyling }) => {
        const code = new QRCodeStyling({
          width: size,
          height: size,
          data: payload,
          margin: 0,
          type: RENDER_FORMAT,
          dotsOptions: { color, type: dots },
          cornersSquareOptions: { color, type: corners },
          cornersDotOptions: { color, type: "dot" },
          backgroundOptions: { color: "transparent" },
          ...(image ? { image } : {}),
        });
        return code.getRawData(RENDER_FORMAT);
      })
      .then(async (data) => {
        // In a browser the renderer answers with a Blob; anything else draws nothing.
        if (cancelled || !(data instanceof Blob)) return;
        const svg = await data.text();
        if (!cancelled) setDrawing({ payload, src: `data:image/svg+xml,${encodeURIComponent(svg)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size, color, dots, corners, image]);

  return (
    <div
      className="shrink-0 box-content overflow-hidden"
      style={{
        width: size,
        height: size,
        padding: margin,
        background: style?.background ?? GiroCodeDefault.Background,
        // Slightly rounded, so the white square sits on the card like the
        // site's other surfaces rather than as a cut-out.
        borderRadius: SMALL_CORNER_RADIUS,
      }}
    >
      {drawing?.payload === payload && (
        <img src={drawing.src} alt={label} width={size} height={size} className="block size-full" />
      )}
    </div>
  );
}
