using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class DoneSendingMapPacket : PacketHandler
    {
        public override string Prefix { get; } = "DSM";

        public override object Parse(PacketParser p)
        {
            return new DoneSendingMapPacket();
        }
    }
}
