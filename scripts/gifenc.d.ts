// Minimal types for gifenc (the package ships none).
declare module "gifenc" {
  type Palette = number[][];
  const gifenc: {
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
    GIFEncoder(): {
      writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number }): void;
      finish(): void;
      bytes(): Uint8Array;
    };
  };
  export default gifenc;
}
