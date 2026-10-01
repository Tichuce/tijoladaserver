using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class SpellSlot : BaseSlot
    {
        public bool Targetable { get { return targetable; } }

        private bool targetable;

        public SpellSlot(int slotNumber, int x, int y, int w, int h) : base(slotNumber, x, y, w, h)
        {
            
        }

        public void SetSlot(string name, int graphicId, bool targetable)
        {
            this.Name = name;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, null);
            this.targetable = targetable;
        }

        public override void HandleDrop(object data)
        {
            if (data is SpellSlot)
            {
                var fromSlot = data as SpellSlot;
                GameClient.NetworkClient.SwapSpellSlot(fromSlot.SlotNumber, this.SlotNumber);
            }
        }
    }
}
