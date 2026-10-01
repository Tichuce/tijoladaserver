using System;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class Label : GuiElement
    {
        public override int W { get { return GameClient.FontRenderer.CharWidth * Value.Length; } }

        public override int H { get { return GameClient.FontRenderer.CharHeight; } }

        public string Value { get; set; }

        public bool DrawShadow { get; set; } = false;

        public bool WordWrap { get; set; } = false;

        public Label(int x, int y, Colour foregroundColour, string value) : base(x, y, 0, 0)
        {
            this.ForegroundColour = foregroundColour;
            this.Value = value;
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (WordWrap)
            {
                GameClient.FontRenderer.RenderWrapped(Value, X, Y, xOffset, yOffset, (this.Parent == null ? GameClient.ScreenWidth : this.Parent.W - this.Parent.Padding), ForegroundColour);
            }
            else
            {
                int x = xOffset + X;
                int y = yOffset + Y;

                if (DrawShadow)
                {
                    // TODO: Make shadow colour configurable
                    GameClient.FontRenderer.RenderText(Value, x - 1, y + 1, Colour.Black);
                }

                GameClient.FontRenderer.RenderText(Value, x, y, ForegroundColour);
            }
        }
    }
}
