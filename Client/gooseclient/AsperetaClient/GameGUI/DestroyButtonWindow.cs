using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class DestroyButtonWindow : BaseWindow
    {
        public DestroyButtonWindow() : base("Destroy")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F12;
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
            }

            return base.HandleEvent(ev, xOffset, yOffset);
        }

        public void HandleDrop(object data)
        {
            if (data is ItemSlot)
            {
                var fromSlot = data as ItemSlot;

                if (fromSlot.Parent is CharacterWindow || fromSlot.Parent is InventoryWindow)
                {
                    GameClient.NetworkClient.DestroyItem(fromSlot.SlotNumber);
                }
            }
            else if (data is SpellSlot)
            {
                var fromSlot = data as SpellSlot;

                GameClient.NetworkClient.DestroySpell(fromSlot.SlotNumber);
            }
        }
    }
}
