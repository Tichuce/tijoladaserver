using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class VendorSlot : BaseSlot
    {
        public int ItemId { get; private set; }

        public VendorSlot(int slotNumber, int x, int y, int w, int h) : base(slotNumber, x, y, w, h)
        {

        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Graphic == null) return;

            base.Render(dt, xOffset, yOffset);
        }

        public void SetSlot(int itemId, string itemName, int graphicId, Colour colour)
        {
            this.ItemId = itemId;
            this.Name = itemName;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, colour);
            this.Colour = colour;
        }

        public override void HandleDrop(object data)
        {
            if (data is ItemSlot)
            {
                var fromSlot = data as ItemSlot;
                if (fromSlot.Parent is InventoryWindow)
                {
                    var vendorWindow = (VendorWindow)this.Parent;
                    GameClient.NetworkClient.VendorSellItem(vendorWindow.NpcId, fromSlot.SlotNumber, fromSlot.StackSize);
                }
            }
        }
    }
}
