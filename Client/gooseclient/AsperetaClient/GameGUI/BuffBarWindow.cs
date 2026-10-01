using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class BuffBarWindow : BaseWindow
    {
        public BuffSlot[] slots;

        public BuffBarWindow() : base("SpellEffects")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F3;
            
            slots = new BuffSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new BuffSlot(r * columns + c, x, y, objW, objH);
                    slot.DoubleClicked += OnSlotDoubleClicked;
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }

            GameClient.NetworkClient.PacketManager.Listen<BuffBarPacket>(OnBuffBar);
        }

        public void OnBuffBar(object packet)
        {
            var p = (BuffBarPacket)packet;

            if (p.SlotNumber < 0 || p.SlotNumber >= slots.Length) return;

            if (p.GraphicId == 0 && p.Name == null)
            {
                slots[p.SlotNumber].Clear();
            }
            else
            {
                slots[p.SlotNumber].SetSlot(p.Name, p.GraphicId);
            }
        }

        public void OnSlotDoubleClicked(GuiElement element)
        {
            GameClient.NetworkClient.KillBuff(((BuffSlot)element).SlotNumber);
        }
    }
}
