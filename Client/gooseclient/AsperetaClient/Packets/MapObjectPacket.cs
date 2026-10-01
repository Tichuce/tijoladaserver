using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class MapObjectPacket : PacketHandler
    {
        public int GraphicId { get; set; }
        public int TileX { get; set; }
        public int TileY { get; set; }
        public string ItemName { get; set; }
        public int StackSize { get; set; }
        public int GraphicR { get; set; }
        public int GraphicG { get; set; }
        public int GraphicB { get; set; }
        public int GraphicA { get; set; }

        public override string Prefix { get; } = "MOB";

        public override object Parse(PacketParser p)
        {
            // MOB120115,44,52,Small Health Potion,1,*
            var packet = new MapObjectPacket()
            {  
                GraphicId = p.GetInt32(),
                TileX = p.GetInt32() - 1,
                TileY = p.GetInt32() - 1,
                ItemName = p.GetString(),
                StackSize = p.GetInt32(),
            };

            if (p.Peek() == '*')
            {
                p.GetString();
                packet.GraphicR = 0;
                packet.GraphicG = 0;
                packet.GraphicB = 0;
                packet.GraphicA = 0;
            }
            else
            {
                packet.GraphicR = p.GetInt32();
                packet.GraphicG = p.GetInt32();
                packet.GraphicB = p.GetInt32();
                packet.GraphicA = p.GetInt32();
            }

            return packet;
        }
    }
}
