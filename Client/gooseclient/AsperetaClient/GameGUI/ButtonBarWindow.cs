using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class ButtonBarWindow : BaseWindow
    {
        private Tooltip tooltip;

        public ButtonBarWindow() : base("ButtonBar")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F11;

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int i = r * columns + c;

                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var button = new Button(x, y, objW, objH);

                    switch (i)
                    {
                        case 0:
                            button.Clicked += (b) => GameClient.NetworkClient.Get();
                            break;
                        case 1:
                            button.Clicked += (b) => ((BaseWindow)UiRoot.Children.FirstOrDefault(w => w is ChatWindow)).ToggleHidden();
                            break;
                        case 2:
                            button.Clicked += (b) => GameClient.NetworkClient.Command("/help");
                            break;
                        case 3:
                            button.Clicked += (b) => GameClient.NetworkClient.OpenCombineBag();
                            break;
                        case 4:
                            button.Clicked += (b) => ((BaseWindow)UiRoot.Children.FirstOrDefault(w => w is InventoryWindow)).ToggleHidden();
                            break;
                        case 5:
                            button.Clicked += (b) => GameClient.NetworkClient.Command("/toggletrade");
                            break;
                        case 6:
                            button.Clicked += (b) => ((BaseWindow)UiRoot.Children.FirstOrDefault(w => w is SpellbookWindow)).ToggleHidden();
                            break;
                        case 7:
                            button.Clicked += (b) => GameClient.Quit();
                            break;
                    }

                    this.AddChild(button);
                }
            }
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    bool contains = Contains(xOffset, yOffset, ev.motion.x, ev.motion.y);
                    if (!contains)
                    {
                        if (tooltip != null)
                        {
                            this.RemoveChild(tooltip);
                            tooltip = null;
                        }

                        return false;
                    }

                    int index = (ev.motion.x - X - xOffset - objoffX) / objW;

                    var tooltips = new[] { "Pickup Item", "Chat Text", "Help", "Combine Bag", "Inventory", "Toggle Trade", "Spellbook", "Exit" };
                    if (index >= tooltips.Length) 
                        return false;

                    string tooltipText = tooltips[index];
                    
                    int x = ev.motion.x;
                    int y = ev.motion.y - GameClient.FontRenderer.CharHeight - 10;

                    if (tooltip == null)
                    {
                        tooltip = new Tooltip(x, y, Colour.Black, Colour.White, tooltipText);
                        tooltip.SetPosition(x, y);
                        this.AddChild(tooltip);
                    }
                    else
                    {
                        tooltip.Value = tooltipText;
                        tooltip.SetPosition(x, y);
                    }

                    break;
            }

            return base.HandleEvent(ev, xOffset, yOffset);
        }
    }
}
