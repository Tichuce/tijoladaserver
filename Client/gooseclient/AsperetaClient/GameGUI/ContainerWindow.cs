using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class ContainerWindow : BaseWindow
    {
        public ItemSlot[] slots;

        public ContainerWindow(MakeWindowPacket p, string windowName) : base(p, windowName)
        {          
            slots = new ItemSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new ItemSlot(r * columns + c, x, y, objW, objH);
                    slot.RightClicked += OnSlotRightClicked;
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }
        }

        protected override void HandleWindowLine(WindowLinePacket p)
        {
            if (p.LineNumber < 0 || p.LineNumber >= slots.Length)
                return;

            if (p.GraphicId == 0)
                slots[p.LineNumber].Clear();
            else
                slots[p.LineNumber].SetSlot(p.ItemId, p.Text, p.StackSize, p.GraphicId, new Colour(p.GraphicR, p.GraphicG, p.GraphicB, p.GraphicA));
        }

        public void OnSlotRightClicked(GuiElement element)
        {
            GameClient.NetworkClient.GetItemDetails(((ItemSlot)element).ItemId);
        }

        public override void OnCloseButtonClicked(Button b)
        {
            GameClient.NetworkClient.WindowButtonClick((int)WindowButtons.Close, this.WindowId, this.NpcId, unknownId1, unknownId2);

            this.Parent.RemoveChild(this);
        }
    }
}
