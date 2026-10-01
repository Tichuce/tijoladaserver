using System;
using System.IO;

namespace AsperetaClient
{
    internal class AsperetaMapLoader
    {
        public static MapFile Load(int mapNumber)
        {
            string filePath = $"maps/Map{mapNumber}.map";

            var map = new MapFile(mapNumber, 100, 100);

            using (var reader = new BinaryReader(File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.Read)))
            {
                // Think these are version number which doesn't matter
                reader.ReadInt16();
                reader.ReadInt16();

                for (int y = 0; y < map.Height; y++)
                {
                    for (int x = 0; x < map.Width; x++)
                    {
                        var tile = new TileData();
                        tile.Blocked = reader.ReadByte() == 1;

                        for (int k = 0; k < 4; k++)
                        {
                            tile.Layers[k] = reader.ReadInt32();
                        }

                        map[x, y] = tile;
                    }
                }
            }

            return map;
        }
    }
}