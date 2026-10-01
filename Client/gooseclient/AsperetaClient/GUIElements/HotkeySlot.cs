using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class HotkeySlot : GuiElement
    {
        public BaseSlot LinkedSlot { get; private set; }

        private bool IsEmpty { get { return LinkedSlot == null || LinkedSlot.IsEmpty; } }

        private Tooltip tooltip;

        public HotkeySlot(int x, int y, int w, int h) : base(x, y, w, h)
        {
            
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (IsEmpty) return;

            LinkedSlot.Graphic.Render(X + xOffset, Y + yOffset, LinkedSlot.Colour);
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
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (!Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                        return false;

                    if (ev.button.button == SDL.SDL_BUTTON_LEFT && ev.button.clicks == 2)
                    {
                        LinkedSlot?.Use();
                    }
                    else if (ev.button.button == SDL.SDL_BUTTON_RIGHT)
                    {
                        Clear();
                    }

                    break;
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    bool contains = Contains(xOffset, yOffset, ev.motion.x, ev.motion.y);
                    
                    if (!IsEmpty && contains)
                    {
                        int x = ev.motion.x;
                        int y = ev.motion.y - GameClient.FontRenderer.CharHeight - 10;

                        if (tooltip == null)
                        {
                            tooltip = new Tooltip(x, y, Colour.Black, Colour.White, LinkedSlot.Name);
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
            LinkedSlot = null;
        }

        public void SetSlot(BaseSlot slot)
        {
            this.LinkedSlot = slot;
        }

        public void HandleDrop(object data)
        {
            if (data is ItemSlot itemSlot)
            {
                if (itemSlot.Parent is CharacterWindow || itemSlot.Parent is InventoryWindow)
                {
                    SetSlot(itemSlot);
                }
            }
            else if (data is SpellSlot spellSlot)
            {
                SetSlot(spellSlot);
            }
            else if (data is ScriptSlot scriptSlot)
            {
                SetSlot(scriptSlot);
            }
        }

        public void Use()
        {
            LinkedSlot?.Use();
        }
    }
}
