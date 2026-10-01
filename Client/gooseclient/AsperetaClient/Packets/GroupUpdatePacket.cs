using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    class GroupUpdatePacket : PacketHandler
    {
        public int LineNumber { get; set; }
        public int LoginId { get; set; }
        public string Name { get; set; }
        public int Level { get; set; }
        public string ClassName { get; set; }

        public override string Prefix { get; } = "GUD";

        public override object Parse(PacketParser p)
        {
            // "GUD" + index + "," + player.LoginID + "," + player.Name + "," + player.Level + player.Class.ClassName;
            var packet = new GroupUpdatePacket()
            {
                LineNumber = p.GetInt32() - 1,
                LoginId = p.GetInt32(),
                Name = p.GetString(),
            };

            if (packet.LoginId > 0)
            {
                packet.Level = p.GetInt32();
                packet.ClassName = p.GetString();
            }

            return packet;
        }
    }
}
