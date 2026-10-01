using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class VendorWindow : BaseWindow
    {
        public VendorSlot[] slots;

        public VendorWindow(MakeWindowPacket p) : base(p, "Vendor")
        {
            slots = new VendorSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new VendorSlot(r * columns + c, x, y, objW, objH);
                    slot.DoubleClicked += OnSlotDoubleClicked;
                    slot.RightClicked += OnSlotRightClicked;
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }
        }

        public void OnSlotDoubleClicked(GuiElement element)
        {
            GameClient.NetworkClient.VendorPurchaseItem(this.NpcId, ((VendorSlot)element).SlotNumber);
        }

        public void OnSlotRightClicked(GuiElement element)
        {
            GameClient.NetworkClient.GetItemDetails(((VendorSlot)element).ItemId);
        }

        protected override void HandleWindowLine(WindowLinePacket p)
        {
            // This is to fix bug on Josh's server where right clicking a vendor twice sends an invalid slot
            if (p.LineNumber < 0 || p.LineNumber >= slots.Length)
                return;

            if (p.GraphicId == 0)
                slots[p.LineNumber].Clear();
            else
                slots[p.LineNumber].SetSlot(p.ItemId, p.Text, p.GraphicId, new Colour(p.GraphicR, p.GraphicG, p.GraphicB, p.GraphicA));
        }

        public override void OnCloseButtonClicked(Button b)
        {
            GameClient.NetworkClient.WindowButtonClick((int)WindowButtons.Close, this.WindowId, this.NpcId, unknownId1, unknownId2);

            this.Parent.RemoveChild(this);
        }
    }
}