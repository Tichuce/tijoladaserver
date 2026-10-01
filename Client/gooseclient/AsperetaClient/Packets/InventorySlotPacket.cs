using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public class InventorySlotPacket : PacketHandler
    {
        public int SlotNumber { get; set; }

        public int ItemId { get; set; }

        public string ItemName { get; set; }

        public int StackSize { get; set; }

        public int GraphicId { get; set; }

        public int GraphicR { get; set; }
        public int GraphicG { get; set; }
        public int GraphicB { get; set; }
        public int GraphicA { get; set; }

        public override string Prefix { get; } = "SIS";

        public override object Parse(PacketParser p)
        {
            // SIS3,5004,Small Health Potion,5,120115,0,0,0,0
            var packet = new InventorySlotPacket()
            {  
                SlotNumber = p.GetInt32() - 1
            };

            if (p.LengthRemaining() > 0)
            {
                packet.ItemId = p.GetInt32();
                packet.ItemName = p.GetString();
                packet.StackSize = p.GetInt32();
                packet.GraphicId = p.GetInt32();
                packet.GraphicR = p.GetInt32();
                packet.GraphicG = p.GetInt32();
                packet.GraphicB = p.GetInt32();
                packet.GraphicA = p.GetInt32();
            }

            return packet;
        }
    }
}
