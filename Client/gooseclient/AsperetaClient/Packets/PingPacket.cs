using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class PingPacket : PacketHandler
    {
        public override string Prefix { get; } = "PING";

        public override object Parse(PacketParser p)
        {
            return new PingPacket();
        }
    }
}
