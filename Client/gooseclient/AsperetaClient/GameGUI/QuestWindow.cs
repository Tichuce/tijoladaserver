using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class QuestWindow : BaseWindow
    {
        private Label[] lines;

        public QuestWindow(MakeWindowPacket p) : base(p, "BlankMessage")
        {
            lines = new Label[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var label = new Label(x + 5, y, Colour.White, "");
                    this.AddChild(label);

                    lines[r * columns + c] = label;
                }
            }
        }

        protected override void HandleWindowLine(WindowLinePacket p)
        {
            lines[p.LineNumber].Value = p.Text;
        }

        public override void OnCloseButtonClicked(Button b)
        {
            GameClient.NetworkClient.WindowButtonClick((int)WindowButtons.Close, this.WindowId, this.NpcId, unknownId1, unknownId2);

            this.Parent.RemoveChild(this);
        }
    }
}