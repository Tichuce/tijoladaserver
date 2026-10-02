using System.IO.Compression;

namespace AsperetaWeb
{
    /** A decoded image as straight RGBA, rows top to bottom. */
    public sealed class RgbaImage
    {
        public int Width { get; }
        public int Height { get; }
        public byte[] Pixels { get; }

        public RgbaImage(int width, int height)
        {
            Width = width;
            Height = height;
            Pixels = new byte[width * height * 4];
        }
    }

    /**
     * Minimal BMP decoder for the game's data (uncompressed 1/4/8/24/32 bpp).
     *
     * The desktop client loads these through SDL_image and then calls
     * SDL_SetColorKey(surface, 1, 0), which makes pixel value 0 transparent: black for
     * 24/32 bpp images and palette index 0 for paletted ones. We bake the same rule into
     * the alpha channel so the browser can draw the PNGs directly.
     */
    public static class Bmp
    {
        public static bool IsBmp(byte[] data) => data.Length > 54 && data[0] == 'B' && data[1] == 'M';

        public static RgbaImage Decode(byte[] data, bool colourKey = true)
        {
            if (!IsBmp(data)) throw new InvalidDataException("Not a BMP file");

            int pixelOffset = BitConverter.ToInt32(data, 10);
            int headerSize = BitConverter.ToInt32(data, 14);
            int width = BitConverter.ToInt32(data, 18);
            int rawHeight = BitConverter.ToInt32(data, 22);
            int bpp = BitConverter.ToUInt16(data, 28);
            int compression = headerSize >= 40 ? BitConverter.ToInt32(data, 30) : 0;
            int coloursUsed = headerSize >= 40 ? BitConverter.ToInt32(data, 46) : 0;

            // BI_RGB, or BI_BITFIELDS for 32 bpp which in practice is BGRA order.
            if (compression != 0 && !(compression == 3 && bpp == 32))
                throw new NotSupportedException($"Compressed BMP (compression {compression}, {bpp} bpp) is not supported");

            bool bottomUp = rawHeight > 0;
            int height = Math.Abs(rawHeight);

            byte[][] palette = null;
            if (bpp <= 8)
            {
                int count = coloursUsed > 0 ? coloursUsed : 1 << bpp;
                palette = new byte[count][];
                int p = 14 + headerSize;
                for (int i = 0; i < count; i++, p += 4)
                    palette[i] = new[] { data[p + 2], data[p + 1], data[p] }; // stored as BGRx
            }

            int stride = ((width * bpp + 31) / 32) * 4;
            var image = new RgbaImage(width, height);
            var px = image.Pixels;

            for (int y = 0; y < height; y++)
            {
                int row = pixelOffset + (bottomUp ? height - 1 - y : y) * stride;
                for (int x = 0; x < width; x++)
                {
                    byte r, g, b;
                    bool transparent;

                    switch (bpp)
                    {
                        case 24:
                        case 32:
                        {
                            int o = row + x * (bpp / 8);
                            b = data[o]; g = data[o + 1]; r = data[o + 2];
                            transparent = r == 0 && g == 0 && b == 0;
                            break;
                        }
                        case 8:
                        case 4:
                        case 1:
                        {
                            int bit = x * bpp;
                            int value = (data[row + bit / 8] >> (8 - bpp - bit % 8)) & ((1 << bpp) - 1);
                            var c = value < palette.Length ? palette[value] : new byte[3];
                            r = c[0]; g = c[1]; b = c[2];
                            transparent = value == 0;
                            break;
                        }
                        default:
                            throw new NotSupportedException($"{bpp} bpp BMP is not supported");
                    }

                    int d = (y * width + x) * 4;
                    px[d] = r;
                    px[d + 1] = g;
                    px[d + 2] = b;
                    px[d + 3] = (byte)(colourKey && transparent ? 0 : 255);
                }
            }

            return image;
        }
    }

    /** Writes 8-bit RGBA PNGs with no dependencies (zlib comes from System.IO.Compression). */
    public static class Png
    {
        private static readonly uint[] CrcTable = BuildCrcTable();

        public static byte[] Encode(RgbaImage image)
        {
            using var ms = new MemoryStream();
            ms.Write(new byte[] { 0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A });

            var ihdr = new byte[13];
            WriteBigEndian(ihdr, 0, (uint)image.Width);
            WriteBigEndian(ihdr, 4, (uint)image.Height);
            ihdr[8] = 8;  // bit depth
            ihdr[9] = 6;  // colour type RGBA
            WriteChunk(ms, "IHDR", ihdr);

            int rowBytes = image.Width * 4;
            var raw = new byte[(rowBytes + 1) * image.Height];
            for (int y = 0; y < image.Height; y++)
            {
                raw[y * (rowBytes + 1)] = 0; // filter: none
                Buffer.BlockCopy(image.Pixels, y * rowBytes, raw, y * (rowBytes + 1) + 1, rowBytes);
            }

            using (var compressed = new MemoryStream())
            {
                using (var z = new ZLibStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true))
                    z.Write(raw, 0, raw.Length);
                WriteChunk(ms, "IDAT", compressed.ToArray());
            }

            WriteChunk(ms, "IEND", Array.Empty<byte>());
            return ms.ToArray();
        }

        private static void WriteChunk(Stream s, string type, byte[] data)
        {
            var header = new byte[8];
            WriteBigEndian(header, 0, (uint)data.Length);
            for (int i = 0; i < 4; i++) header[4 + i] = (byte)type[i];
            s.Write(header);
            s.Write(data);

            uint crc = 0xFFFFFFFF;
            for (int i = 4; i < 8; i++) crc = CrcTable[(crc ^ header[i]) & 0xFF] ^ (crc >> 8);
            foreach (byte b in data) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);

            var crcBytes = new byte[4];
            WriteBigEndian(crcBytes, 0, crc ^ 0xFFFFFFFF);
            s.Write(crcBytes);
        }

        private static void WriteBigEndian(byte[] buffer, int offset, uint value)
        {
            buffer[offset] = (byte)(value >> 24);
            buffer[offset + 1] = (byte)(value >> 16);
            buffer[offset + 2] = (byte)(value >> 8);
            buffer[offset + 3] = (byte)value;
        }

        private static uint[] BuildCrcTable()
        {
            var table = new uint[256];
            for (uint n = 0; n < 256; n++)
            {
                uint c = n;
                for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
                table[n] = c;
            }
            return table;
        }
    }
}
