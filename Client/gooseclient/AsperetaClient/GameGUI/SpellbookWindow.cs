using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class SpellbookWindow : BaseWindow
    {
        public SpellSlot[] slots;

        public event Action<SpellSlot> CastSpell;

        public SpellbookWindow() : base("SpellBook")
        {
            hideShortcutKey = GameClient.KeyMap.OpenSpellbook;

            slots = new SpellSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new SpellSlot(r * columns + c, x, y, objW, objH);
                    slot.DoubleClicked += OnSlotDoubleClicked;
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }

            GameClient.NetworkClient.PacketManager.Listen<SpellbookSlotPacket>(OnSpellbookSlot);
        }

        public void OnSpellbookSlot(object packet)
        {
            var p = (SpellbookSlotPacket)packet;

            if (p.SlotNumber < 0 || p.SlotNumber >= slots.Length) return;

            if (p.SpellName == null)
            {
                slots[p.SlotNumber].Clear();
            }
            else
            {
                slots[p.SlotNumber].SetSlot(p.SpellName, p.Graphic, p.Targetable);
            }
        }

        public void OnSlotDoubleClicked(GuiElement element)
        {
            var slot = (SpellSlot)element;
            if (!slot.IsEmpty)
                this.CastSpell?.Invoke(slot);
        }
    }
}
