

namespace AsperetaClient
{
    public class Colour
    {
        public static Colour None = new Colour(0, 0, 0, 0);

        public static Colour White = new Colour(255, 255, 255, 255);
        public static Colour Black = new Colour(1, 1, 1, 255);
        public static Colour Yellow = new Colour(248, 208, 0, 255);
        public static Colour Green = new Colour(136, 204, 64, 255);
        public static Colour Red = new Colour(254, 81, 28, 255);
        public static Colour Blue = new Colour(0, 146, 255, 255);
        public static Colour Purple = new Colour(135, 138, 255, 255);

        public static Colour ChatBackground = new Colour(1, 1, 1, 255);
        public static Colour ChatForeground = new Colour(255, 255, 255, 255);


        public byte R { get; set; }

        public byte G { get; set; }

        public byte B { get; set; }

        public byte A { get; set; }

        public Colour(byte r, byte g, byte b, byte a = 255)
        {
            this.R = r;
            this.G = g;
            this.B = b;
            this.A = a;
        }

        public Colour(int r, int g, int b, int a = 255)
        {
            this.R = (byte)r;
            this.G = (byte)g;
            this.B = (byte)b;
            this.A = (byte)a;
        }
    }
}
