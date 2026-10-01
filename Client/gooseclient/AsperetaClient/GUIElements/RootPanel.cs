using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class RootPanel : BaseContainer
    {
        public bool IsDragging { get; set; } = false;
        public object DragDropData { get; set; }
        public Texture DragDropImage { get; set; }
        public Colour DragDropImageColour { get; set; }
        public int StartDragDropX { get; set; }
        public int StartDragDropY { get; set; }
        public int DragDropX { get; set; }
        public int DragDropY { get; set; }
        public bool DropWasHandled { get; set; } = false;
        public Dictionary<int, object> DragDropEventData { get; set; } = new Dictionary<int, object>();

        // Kind of ugly, but don't know what else to do, some parts of the UI need to know the player character
        public Character Player { get; set; }

        public TextBox FocusedTextBox { get; set; }

        public event Action<object> DropWasUnhandled;

        public event Action<int, int> LeftClickUnhandled;
        public event Action<int, int> DoubleClickUnhandled;
        public event Action<int, int> RightClickUnhandled;

        public RootPanel() : this(0, 0, GameClient.ScreenWidth, GameClient.ScreenHeight)
        {

        }

        public RootPanel(int x, int y, int w, int h) : base(x, y, w, h)
        {
            GuiElement.UiRoot = this;
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            object dragDropDataToRemove = null;

            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_USEREVENT:
                    if (ev.user.type == GameClient.DRAG_DROP_EVENT_ID)
                    {
                        dragDropDataToRemove = GetDragDropEventData(ev);
                        int x = ev.user.code >> 16;
                        int y = ev.user.code & 0xFFFF;

                        bool droppedOnWindow = false;
                        foreach (var element in Children.Where(c => c is BaseWindow).Cast<BaseWindow>())
                        {
                            if (!element.Hidden && element.Contains(xOffset, yOffset, x, y))
                            {
                                droppedOnWindow = true;
                                break;
                            }
                        }

                        if (!droppedOnWindow)
                        {
                            this.DropWasUnhandled?.Invoke(dragDropDataToRemove);
                        }
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (IsDragging && ev.button.button == SDL.SDL_BUTTON_LEFT)
                    {
                        if (Math.Abs(StartDragDropX - ev.button.x) > 6 || Math.Abs(StartDragDropY - ev.button.y) > 6)
                        {
                            AddDragDropEvent(ev.button.x, ev.button.y, DragDropData);
                        }

                        IsDragging = false;
                        StartDragDropX = 0;
                        StartDragDropY = 0;
                        DragDropX = 0;
                        DragDropY = 0;
                        DragDropImage = null;
                        DragDropData = null;
                    }
                    else if (ev.button.button == SDL.SDL_BUTTON_LEFT || ev.button.button == SDL.SDL_BUTTON_RIGHT)
                    {
                        bool clickedWindow = false;
                        foreach (var element in Children.Where(c => c is BaseWindow).Cast<BaseWindow>())
                        {
                            if (!element.Hidden && element.Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                            {
                                clickedWindow = true;
                                break;
                            }
                        }

                        if (!clickedWindow)
                        {
                            if (ev.button.button == SDL.SDL_BUTTON_LEFT)
                            {
                                if (ev.button.clicks == 1)
                                    LeftClickUnhandled?.Invoke(ev.button.x, ev.button.y);
                                else
                                    DoubleClickUnhandled?.Invoke(ev.button.x, ev.button.y);
                            }
                            else
                            {
                                RightClickUnhandled?.Invoke(ev.button.x, ev.button.y);
                            }
                        }
                    }

                    break;
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    if (IsDragging)
                    {
                        DragDropX = ev.motion.x;
                        DragDropY = ev.motion.y;
                    }

                    break;
            }

            var returnVal = base.HandleEvent(ev, xOffset, yOffset);

            if (dragDropDataToRemove != null)
                DragDropEventData.Remove(dragDropDataToRemove.GetHashCode());

            return returnVal;
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            base.Render(dt, xOffset, yOffset);

            if (DragDropImage != null)
                DragDropImage.Render(DragDropX, DragDropY, DragDropImageColour);
        }

        public override void Update(double dt)
        {
            foreach (var gui in Children.ToArray())
            {
                gui.Update(dt);
            }
        }

        public void BringToFront(GuiElement element)
        {
            // Bump window to be rendered on top
            Children.Remove(element);
            Children.Add(element);
        }

        public void StartDragDrop(int x, int y, Texture image, Colour colour, object data)
        {
            IsDragging = true;
            StartDragDropX = x;
            StartDragDropY = y;
            DragDropX = x;
            DragDropY = y;
            DragDropImage = image;
            DragDropImageColour = colour;
            DragDropData = data;
            DropWasHandled = false;
        }

        private void AddDragDropEvent(int x, int y, object data)
        {
            // This is kind of a hack so that we don't have to allocate memory and pass the object to SDL
            // Mainly so we don't have to figure out how to clean up the memory
            DragDropEventData[data.GetHashCode()] = data;

            SDL.SDL_Event ev = new SDL.SDL_Event();
            ev.type = SDL.SDL_EventType.SDL_USEREVENT;
            ev.user.code = x << 16 | y;
            ev.user.type = GameClient.DRAG_DROP_EVENT_ID;
            ev.user.windowID = (uint)data.GetHashCode();
            SDL.SDL_PushEvent(ref ev);
        }

        public object GetDragDropEventData(SDL.SDL_Event ev)
        {
            if (DragDropEventData.TryGetValue((int)ev.user.windowID, out object data))
                return data;

            return null;
        }

        public void SetDragDropHandled()
        {
            DropWasHandled = true;
        }
    }
}
