using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public class UpdateCharacterPacket : PacketHandler
    {
        public int LoginId { get; set; }
        public int BodyId { get; set; }
        public int BodyState { get; set; }
        public int HairId { get; set; }
        public int[][] DisplayedEquipment { get; set; }
        public int HairR { get; set; }
        public int HairG { get; set; }
        public int HairB { get; set; }
        public int HairA { get; set; }
        public int Invisible { get; set; }
        public int FaceId { get; set; }

        public override string Prefix { get; } = "CHP";

        public override object Parse(PacketParser p)
        {
            return new UpdateCharacterPacket()
            {  
                LoginId = p.GetInt32(),
                BodyId = p.GetInt32(),
                BodyState = p.GetInt32(),
                HairId = p.GetInt32(),
                DisplayedEquipment = ParseEquippedItems(p),
                HairR = p.GetInt32(),
                HairG = p.GetInt32(),
                HairB = p.GetInt32(),
                HairA = p.GetInt32(),
                Invisible = p.GetInt32(),
                FaceId = p.GetInt32()
            };
        }

        public int[][] ParseEquippedItems(PacketParser p)
        {
            // Chest, Head, Legs, Feet, Shield, Weapon
            var equipped = new int[6][];
            for (int i = 0; i < 6; i++)
            {
                equipped[i] = new int[5];
                int j = 0;
                equipped[i][j++] = p.GetInt32(); // item graphic id

                if (p.Peek() == '*')
                {
                    p.GetString(); // eat the string
                    equipped[i][j++] = 0; // r
                    equipped[i][j++] = 0; // g
                    equipped[i][j++] = 0; // b
                    equipped[i][j++] = 0; // a
                }
                else
                {
                    equipped[i][j++] = p.GetInt32(); // r
                    equipped[i][j++] = p.GetInt32(); // g
                    equipped[i][j++] = p.GetInt32(); // b
                    equipped[i][j++] = p.GetInt32(); // a
                }
            }

            return equipped;
        }
    }
}
