using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public class ChangeHeadingPacket : PacketHandler
    {
        public int LoginId { get; set; }

        public int Facing { get; set; }

        public override string Prefix { get; } = "CHH";

        public override object Parse(PacketParser p)
        {
            return new ChangeHeadingPacket()
            {  
                LoginId = p.GetInt32(),
                Facing = p.GetInt32() - 1
            };
        }
    }
}
