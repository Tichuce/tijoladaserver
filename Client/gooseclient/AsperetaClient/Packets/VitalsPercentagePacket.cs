using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public class VitalsPercentagePacket : PacketHandler
    {
        public int LoginId { get; set; }

        public int HPPercentage { get; set; }

        public int MPPercentage { get; set; }

        public override string Prefix { get; } = "VC";

        public override object Parse(PacketParser p)
        {
            return new VitalsPercentagePacket()
            {  
                LoginId = p.GetInt32(),
                HPPercentage = p.GetInt32(),
                MPPercentage = p.GetInt32()
            };
        }
    }
}
