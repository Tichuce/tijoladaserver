using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public class SpellbookSlotPacket : PacketHandler
    {
        public int SlotNumber { get; set; }

        public string SpellName { get; set; }

        public int Unknown1 { get; set; }

        public int Unknown2 { get; set; }

        public bool Targetable { get; set; }

        public int Graphic { get; set; }

        public override string Prefix { get; } = "SSS";

        public override object Parse(PacketParser p)
        {
            // SSS1
            // SSS2,Teleportation,0,0,X,110009
            // SSS3,Root,0,0,T,110024
            var packet = new SpellbookSlotPacket()
            {  
                SlotNumber = p.GetInt32() - 1
            };

            if (p.LengthRemaining() > 0)
            {
                packet.SpellName = p.GetString();
                packet.Unknown1 = p.GetInt32();
                packet.Unknown2 = p.GetInt32();
                packet.Targetable = p.GetString() == "T";
                packet.Graphic = p.GetInt32();
            }

            return packet;
        }
    }
}
