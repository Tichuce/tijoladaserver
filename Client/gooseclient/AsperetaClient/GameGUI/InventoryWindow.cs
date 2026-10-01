using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class InventoryWindow : BaseWindow
    {
        public ItemSlot[] slots;

        public InventoryWindow() : base("Inventory")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_i;
            
            slots = new ItemSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new ItemSlot(r * columns + c, x, y, objW, objH);
                    slot.DoubleClicked += OnSlotDoubleClicked;
                    slot.RightClicked += OnSlotRightClicked;
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }

            GameClient.NetworkClient.PacketManager.Listen<InventorySlotPacket>(OnInventorySlot);
        }

        public void OnInventorySlot(object packet)
        {
            var p = (InventorySlotPacket)packet;

            if (p.SlotNumber < 0 || p.SlotNumber >= slots.Length) return;

            if (p.ItemId == 0)
            {
                slots[p.SlotNumber].Clear();
            }
            else
            {
                slots[p.SlotNumber].SetSlot(p.ItemId, p.ItemName, p.StackSize, p.GraphicId, new Colour(p.GraphicR, p.GraphicG, p.GraphicB, p.GraphicA));
            }
        }

        public void OnSlotDoubleClicked(GuiElement element)
        {
            GameClient.NetworkClient.Use(((ItemSlot)element).SlotNumber);
        }

        public void OnSlotRightClicked(GuiElement element)
        {
            GameClient.NetworkClient.GetItemDetails(((ItemSlot)element).ItemId);
        }
    }
}
