using System;
using System.Runtime.InteropServices;
using System.Linq;
using SDL2;

namespace AsperetaClient
{
    public class BaseContainer : GuiElement
    {
        public BaseContainer() : base(0, 0, GameClient.ScreenWidth, GameClient.ScreenHeight)
        {

        }

        public BaseContainer(int x, int y, int w, int h) : base(x, y, w, h)
        {

        }

        public override void Update(double dt)
        {
            foreach (var gui in Children.ToArray())
            {
                gui.Update(dt);
            }
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            foreach (var gui in Children)
            {
                gui.Render(dt, X + xOffset, Y + yOffset);
            }
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            foreach (var gui in Children.Reverse<GuiElement>().ToArray())
            {
                bool preventFurtherEvents = gui.HandleEvent(ev, X + xOffset, Y + yOffset);
                if (preventFurtherEvents)
                    return true;
            }

            return false;
        }
    }
}
