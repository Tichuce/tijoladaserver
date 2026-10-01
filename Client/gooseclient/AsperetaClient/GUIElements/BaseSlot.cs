using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public abstract class BaseSlot : GuiElement
    {
        public int SlotNumber { get; set; }
        public Texture Graphic { get; protected set; }
        public Colour Colour { get; protected set; }
        public string Name { get; protected set; }

        public bool IsEmpty { get { return Name == null; } }

        protected Tooltip tooltip;

        public event Action<GuiElement> DoubleClicked;
        public event Action<GuiElement> RightClicked;

        public BaseSlot(int slotNumber, int x, int y, int w, int h) : base(x, y, w, h)
        {
            this.SlotNumber = slotNumber;
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Graphic == null) return;

            Graphic.Render(X + xOffset, Y + yOffset, Colour);
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_USEREVENT:
                    if (ev.user.type == GameClient.DRAG_DROP_EVENT_ID)
                    {
                        int x = ev.user.code >> 16;
                        int y = ev.user.code & 0xFFFF;
                        if (Contains(xOffset, yOffset, x, y))
                        {
                            object data = UiRoot.GetDragDropEventData(ev);
                            UiRoot.SetDragDropHandled();

                            HandleDrop(data);

                            return true;
                        }
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONDOWN:
                    if (Graphic != null && ev.button.button == SDL.SDL_BUTTON_LEFT && Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                    {
                        UiRoot.StartDragDrop(ev.button.x, ev.button.y, Graphic, Colour, this);

                        return true;
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (!Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                        return false;

                    if (ev.button.button == SDL.SDL_BUTTON_LEFT && ev.button.clicks >= 2)
                    {
                        DoubleClicked?.Invoke(this);
                    }
                    else if (ev.button.button == SDL.SDL_BUTTON_RIGHT)
                    {
                        RightClicked?.Invoke(this);
                    }

                    break;
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    bool contains = Contains(xOffset, yOffset, ev.motion.x, ev.motion.y);
                    
                    if (contains && Name != null)
                    {
                        int x = ev.motion.x;
                        int y = ev.motion.y - GameClient.FontRenderer.CharHeight - 10;

                        if (tooltip == null)
                        {
                            tooltip = new Tooltip(x, y, Colour.Black, Colour.White, Name);
                            this.Parent.AddChild(tooltip);
                        }
                        else
                        {
                            tooltip.SetPosition(x, y);
                        }
                    }
                    else if (tooltip != null && !contains)
                    {
                        this.Parent.RemoveChild(tooltip);
                        tooltip = null;
                    }

                    break;
            }

            return false;
        }

        public void Clear()
        {
            Graphic = null;
            Name = null;
        }

        public abstract void HandleDrop(object data);

        public void Use()
        {
            this.DoubleClicked?.Invoke(this);
        }
    }
}
