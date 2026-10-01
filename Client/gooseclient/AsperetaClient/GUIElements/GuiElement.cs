using System;
using System.Collections.Generic;
using SDL2;

namespace AsperetaClient
{
    public abstract class GuiElement
    {
        public SDL.SDL_Rect Rect;

        public virtual int X { get { return centerX ? CenterH(W) : Rect.x; } }

        public virtual int Y { get { return centerY ? CenterV(H) : Rect.y; } }

        public virtual int W { get { return Rect.w; } }

        public virtual int H { get { return Rect.h; } }

        public int ZIndex { get; set; }

        public int Padding { get; set; }

        public Colour BackgroundColour { get; set; }

        public Colour ForegroundColour { get; set; }

        public List<GuiElement> Children { get; set; } = new List<GuiElement>();

        public GuiElement Parent { get; set; }

        public bool HasFocus { get; set; }

        public static RootPanel UiRoot { get; set; }

        protected bool centerX = false;
        protected bool centerY = false;

        public GuiElement(int x, int y, int w, int h)
        {
            if (x == -1)
            {
                x = 0;
                centerX = true;
            }
            if (y == -1)
            {
                y = 0;
                centerY = true;
            }

            SDL.SDL_Rect rect;
            rect.x = x;
            rect.y = y;
            rect.w = w;
            rect.h = h;
            this.Rect = rect;

            this.HasFocus = false;
            this.ZIndex = -1;
        }

        public GuiElement(int x, int y, int w, int h, Colour backgroundColour, Colour foregroundColour) : this(x, y, w, h)
        {
            this.BackgroundColour = backgroundColour;
            this.ForegroundColour = foregroundColour;
        }

        public abstract void Render(double dt, int xOffset, int yOffset);

        public virtual void Update(double dt) { }

        public virtual bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset) { return false; }

        public int CenterH(int w)
        {
            return (Parent?.W ?? GameClient.ScreenWidth) / 2 - w / 2;
        }

        public int CenterV(int h)
        {
            return (Parent?.H ?? GameClient.ScreenHeight) / 2 - h / 2;
        }

        public void AddChild(GuiElement child)
        {
            int insertIndex = 0;
            for (int i = 0; i < Children.Count; i++)
            {
                insertIndex++;

                var other = Children[i];
                if (other.ZIndex > child.ZIndex)
                {
                    insertIndex--;
                    break;
                }
            }

            Children.Insert(insertIndex, child);

            child.Parent = this;
        }

        public void RemoveChild(GuiElement child)
        {
            Children.Remove(child);
            child.Parent = null;
        }

        public bool Contains(int xOffset, int yOffset, int check_x, int check_y)
        {
            return (check_x >= this.X + xOffset && check_x <= this.X + xOffset + this.W &&
                    check_y >= this.Y + yOffset && check_y <= this.Y + yOffset + this.H);
        }

        public bool Contains(int x, int y, int w, int h, int check_x, int check_y)
        {
            return (check_x >= x && check_x <= x + w &&
                    check_y >= y && check_y <= y + h);
        }

        public virtual void SetPosition(int x, int y)
        {
            Rect.x = x;
            Rect.y = y;
        }
    }
}
