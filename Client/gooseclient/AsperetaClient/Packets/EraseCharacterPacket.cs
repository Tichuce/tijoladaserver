using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class EraseCharacterPacket : PacketHandler
    {
        public int LoginId { get; set; }

        public override string Prefix { get; } = "ERC";

        public override object Parse(PacketParser p)
        {
            return new EraseCharacterPacket()
            {  
                LoginId = p.GetInt32()
            };
        }
    }
}
