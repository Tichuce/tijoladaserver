using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class SendCurrentMapPacket : PacketHandler
    {
        public int MapNumber { get; set; }

        public int MapVersion { get; set; }

        public string MapName { get; set; }

        public override string Prefix { get; } = "SCM";

        public override object Parse(PacketParser p)
        {
            // SCMMapId,MapVersion,MapName
            return new SendCurrentMapPacket()
            {  
                MapNumber = p.GetInt32(),
                MapVersion = p.GetInt32(),
                MapName = p.GetRemaining()
            };
        }
    }
}
