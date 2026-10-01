using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    abstract class StatBarWindow : BaseWindow
    {
        protected long value;

        protected long maxValue;

        private Texture barTexture;

        protected string tooltipText = "";

        protected Tooltip tooltip;

        public StatBarWindow(string windowName) : base(windowName)
        {
            var barImage = GameClient.WindowSettings[this.Name]["image2"];
            barTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{barImage}");
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Hidden) return;

            base.Render(dt, xOffset, yOffset);

            int w = (int)(objW * GetPercentage());

            barTexture.RenderClipped(X + objoffX + xOffset, objoffY + Y + yOffset, w, objH);

            var label = value.ToString();
            int labelX = objoffX + objW - (label.Length * GameClient.FontRenderer.CharWidth);

            GameClient.FontRenderer.RenderText(label, labelX + X + xOffset, objoffY + Y + yOffset + (objH / 2) - GameClient.FontRenderer.CharHeight / 2, Colour.White);

            // TODO: HACK FOR NOW
            tooltip?.Render(dt, xOffset, yOffset);
        }

        protected virtual double GetPercentage()
        {
            return ((double)value / maxValue);
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    bool contains = Contains(X + objoffX + xOffset, objoffY + Y + yOffset, objW, objH, ev.motion.x, ev.motion.y);
                    
                    if (contains)
                    {
                        int x = ev.motion.x;
                        int y = ev.motion.y - GameClient.FontRenderer.CharHeight - 10;

                        if (tooltip == null)
                        {
                            tooltip = new Tooltip(x, y, Colour.Black, Colour.White, tooltipText);
                            this.AddChild(tooltip);
                        }
                        else
                        {
                            tooltip.SetPosition(x, y);
                        }
                    }
                    else if (tooltip != null)
                    {
                        this.RemoveChild(tooltip);
                        tooltip = null;
                    }

                    break;
            }

            return base.HandleEvent(ev, xOffset, yOffset);
        }
    }
}
