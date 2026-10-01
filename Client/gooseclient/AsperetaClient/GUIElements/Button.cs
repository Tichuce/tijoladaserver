using System;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class Button : GuiElement
    {
        public Texture UpTexture { get; set; }
        public Texture DownTexture { get; set; }

        private Label label;

        private bool pressed = false;

        public event Action<Button> Clicked;

        public Button(int x, int y, int w, int h, string label = null) : base(x, y, w, h)
        {
            if (label != null)
            {
                this.label = new Label(-1, -1, new Colour(209, 129, 51), label) { DrawShadow = true };
                AddChild(this.label);
            }
        }

        public override void Update(double dt)
        {

        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (pressed && DownTexture != null)
                DownTexture?.Render(this.X + xOffset, this.Y + yOffset);
            else
                UpTexture?.Render(this.X + xOffset, this.Y + yOffset);

            label?.Render(dt, this.X + xOffset, this.Y + yOffset + (pressed ? 1 : 0));
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_MOUSEBUTTONDOWN:
                    if (Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                    {
                        pressed = true;
                    }

                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                    {
                        if (Clicked != null)
                            Clicked(this);
                    }

                    pressed = false;

                    break;
            }

            return false;
        }
    }
}
