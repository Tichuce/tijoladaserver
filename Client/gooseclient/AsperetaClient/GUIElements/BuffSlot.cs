using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class BuffSlot : BaseSlot
    {
        public BuffSlot(int slotNumber, int x, int y, int w, int h) : base(slotNumber, x, y, w, h)
        {

        }

        public void SetSlot(string name, int graphicId)
        {
            this.Name = name;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, null);
        }

        public override void HandleDrop(object data)
        {

        }
    }
}
