using System;

namespace AsperetaClient
{
    public class TileData
    {
        public bool Blocked { get; set; }
        public int[] Layers { get; set; }

        public TileData()
        {
            this.Layers = new int[4];
        }
    }

    public class MapFile
    {
        public int MapNumber { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public TileData[] Tiles { get; set; }

        public MapFile(int mapNumber, int width, int height)
        {
            this.MapNumber = mapNumber;
            this.Width = width;
            this.Height = height;
            this.Tiles = new TileData[this.Width * this.Height];
        }

        public TileData this[int x, int y]
        {
            get { return this.Tiles[y * this.Width + x]; }
            set { this.Tiles[y * this.Width + x] = value; }
        }
    }
}