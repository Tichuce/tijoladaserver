using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class ItemSlot : BaseSlot
    {
        public int StackSize { get; private set; }
        public int ItemId { get; private set; }

        public ItemSlot(int slotNumber, int x, int y, int w, int h) : base(slotNumber, x, y, w, h)
        {

        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Graphic == null) return;

            base.Render(dt, xOffset, yOffset);

            if (StackSize > 1)
                GameClient.FontRenderer.RenderText(StackSize.ToString(), X + xOffset + 6, Y + yOffset + 2, Colour.White);
        }

        public void SetSlot(int itemId, string itemName, int stackSize, int graphicId, Colour colour)
        {
            this.ItemId = itemId;
            this.Name = itemName;
            this.StackSize = stackSize;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, colour);
            this.Colour = colour;
        }

        public override void HandleDrop(object data)
        {
            if (data is ItemSlot)
            {
                var fromSlot = data as ItemSlot;

                if (this.Parent is CharacterWindow || fromSlot.Parent is CharacterWindow)
                {
                    GameClient.NetworkClient.Use(fromSlot.SlotNumber);
                }
                else
                {
                    if (this.Parent is InventoryWindow && fromSlot.Parent is InventoryWindow)
                    {
                        var keyMod = SDL.SDL_GetModState();
                        if ((keyMod & SDL.SDL_Keymod.KMOD_CTRL) != SDL.SDL_Keymod.KMOD_NONE)
                        {
                            GameClient.NetworkClient.Split(fromSlot.SlotNumber, this.SlotNumber);
                        }
                        else
                        {
                            GameClient.NetworkClient.Change(fromSlot.SlotNumber, this.SlotNumber);
                        }
                    }
                    else if (fromSlot.Parent is InventoryWindow && this.Parent is ContainerWindow)
                    {
                        GameClient.NetworkClient.InventoryToWindow(fromSlot.SlotNumber, ((BaseWindow)this.Parent).WindowId, this.SlotNumber);
                    }
                    else if (fromSlot.Parent is ContainerWindow && this.Parent is InventoryWindow)
                    {
                        GameClient.NetworkClient.WindowToInventory(((BaseWindow)fromSlot.Parent).WindowId, fromSlot.SlotNumber, this.SlotNumber);
                    }
                    else if (fromSlot.Parent is ContainerWindow && this.Parent is ContainerWindow)
                    {
                        GameClient.NetworkClient.WindowToWindow(((BaseWindow)fromSlot.Parent).WindowId, fromSlot.SlotNumber, ((BaseWindow)this.Parent).WindowId, this.SlotNumber);
                    }
                }
            }
        }
    }
}
