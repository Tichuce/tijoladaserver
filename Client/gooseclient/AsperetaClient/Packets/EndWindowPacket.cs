using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class EndWindowPacket : PacketHandler
    {
        public int WindowId { get; set; }

        public override string Prefix { get; } = "ENW";

        public override object Parse(PacketParser p)
        {
            return new EndWindowPacket()
            {  
                WindowId = p.GetInt32(),
            };
        }
    }
}
